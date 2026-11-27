//! The loopback redirect of a desktop sign-in: a listener on 127.0.0.1 and a random port, which takes the browser's
//! one redirect and hands its query to TypeScript. Thin glue: the sign-in itself (PKCE, state, tokens) is in TS.

use std::io::{BufRead, BufReader, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::State;

#[derive(Default)]
struct Pending {
    listener: Option<TcpListener>,
    cancel: Option<Arc<AtomicBool>>,
}

#[derive(Default)]
pub struct Redirect(Mutex<Pending>);

/// The page the browser shows after signing in.
const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>malplan</title><p style=\"font:16px sans-serif;margin:40px\">로그인을 마쳤습니다. 이 창을 닫고 malplan으로 돌아가세요.</p>";

/// The page the browser shows when sign-in was cancelled or denied at Google.
const ERROR_PAGE: &str = "<!doctype html><meta charset=utf-8><title>malplan</title><p style=\"font:16px sans-serif;margin:40px\">로그인을 취소했거나 완료하지 못했습니다. 이 창을 닫고 malplan으로 돌아가세요.</p>";

/// How long a sign-in may take in the browser.
const WAIT: Duration = Duration::from_secs(300);

/// Opens the listener and returns its port. A second call cancels any earlier wait and replaces the listener.
#[tauri::command]
pub fn oauth_listen(state: State<Redirect>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    if let Some(previous) = guard.cancel.take() {
        previous.store(true, Ordering::SeqCst);
    }

    guard.listener = Some(listener);
    guard.cancel = Some(Arc::new(AtomicBool::new(false)));

    Ok(port)
}

/// Cancels any pending or waiting sign-in so the browser wait thread stops promptly.
#[tauri::command]
pub fn oauth_cancel(state: State<Redirect>) {
    if let Ok(mut guard) = state.0.lock() {
        guard.listener = None;

        if let Some(flag) = guard.cancel.take() {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

/// Waits for the redirect and returns its query ("code=…&state=…" or "error=…"). Requests without either (a favicon
/// or an idle speculative browser socket) are ignored and the wait goes on.
#[tauri::command(async)]
pub fn oauth_wait(state: State<Redirect>) -> Result<String, String> {
    let (listener, cancel) = {
        let mut guard = state.0.lock().map_err(|e| e.to_string())?;
        let listener = guard.listener.take().ok_or("no sign-in in progress")?;
        let cancel = guard.cancel.clone().ok_or("no sign-in in progress")?;

        (listener, cancel)
    };

    wait_on(listener, &cancel, WAIT)
}

fn wait_on(listener: TcpListener, cancel: &AtomicBool, timeout: Duration) -> Result<String, String> {
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let started = Instant::now();

    while started.elapsed() < timeout {
        if cancel.load(Ordering::SeqCst) {
            return Err("sign-in cancelled".into());
        }

        match listener.accept() {
            Ok((mut stream, _)) => {
                if let Some(query) = handle_connection(&mut stream) {
                    return Ok(query);
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }

    Err("sign-in timed out".into())
}

/// Handles one loopback socket; transient read errors (e.g. Chromium speculative preconnect) return None so the wait continues.
fn handle_connection(stream: &mut TcpStream) -> Option<String> {
    stream.set_nonblocking(false).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).ok()?;

    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut line = String::new();

    if reader.read_line(&mut line).ok()? == 0 {
        return None;
    }

    // Drain remaining request headers (capped) so dropping the Windows socket does not TCP-RST before the browser reads the page.
    let mut header = String::new();

    for _ in 0..64 {
        header.clear();

        match reader.read_line(&mut header) {
            Ok(0) | Err(_) => break,
            Ok(_) if header == "\r\n" || header == "\n" => break,
            Ok(_) => {}
        }
    }

    if let Some(query) = redirect_query(&line) {
        let page = if query_has_error(&query) { ERROR_PAGE } else { DONE_PAGE };
        let _ = write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{page}",
            page.len()
        );
        let _ = stream.flush();
        let _ = stream.shutdown(Shutdown::Write);

        return Some(query);
    }

    let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    let _ = stream.flush();
    let _ = stream.shutdown(Shutdown::Write);

    None
}

/// "GET /?code=1&state=2 HTTP/1.1" gives "code=1&state=2"; only a redirect carrying a code or an error counts.
fn redirect_query(request_line: &str) -> Option<String> {
    let target = request_line.strip_prefix("GET ")?.split(' ').next()?;
    let query = target.split_once('?')?.1;

    query.split('&').any(|pair| pair.starts_with("code=") || pair.starts_with("error=")).then(|| query.to_string())
}

fn query_has_error(query: &str) -> bool {
    query.split('&').any(|pair| pair.starts_with("error="))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn only_a_redirect_with_a_code_or_an_error_is_taken() {
        assert_eq!(redirect_query("GET /?state=s&code=4%2F0A HTTP/1.1\r\n"), Some("state=s&code=4%2F0A".into()));
        assert_eq!(redirect_query("GET /?error=access_denied&state=s HTTP/1.1"), Some("error=access_denied&state=s".into()));
        assert_eq!(redirect_query("GET /favicon.ico HTTP/1.1"), None);
        assert_eq!(redirect_query("POST /?code=1 HTTP/1.1"), None);
        assert_eq!(redirect_query("GET /?decode=1 HTTP/1.1"), None);
        assert!(query_has_error("error=access_denied&state=s"));
        assert!(!query_has_error("code=4%2F0A&state=s"));
    }

    #[test]
    fn empty_preconnect_socket_does_not_abort_wait_and_error_shows_error_page() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_bg = Arc::clone(&cancel);

        let handle = std::thread::spawn(move || wait_on(listener, &cancel_bg, Duration::from_secs(5)));

        // Idle speculative socket closed without sending anything.
        drop(TcpStream::connect(addr).unwrap());

        // Real redirect with an error query.
        let mut client = TcpStream::connect(addr).unwrap();

        client.write_all(b"GET /?error=access_denied&state=s HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();

        let mut response = String::new();

        client.read_to_string(&mut response).unwrap();

        assert_eq!(handle.join().unwrap().unwrap(), "error=access_denied&state=s");
        assert!(response.contains("취소했거나"));
    }

    #[test]
    fn cancel_stops_waiting_promptly() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_bg = Arc::clone(&cancel);

        let handle = std::thread::spawn(move || wait_on(listener, &cancel_bg, Duration::from_secs(30)));

        cancel.store(true, Ordering::SeqCst);

        assert_eq!(handle.join().unwrap(), Err("sign-in cancelled".into()));
    }
}
