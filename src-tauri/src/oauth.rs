//! The loopback redirect of a desktop sign-in: a listener on 127.0.0.1 and a random port, which takes the browser's
//! one redirect and hands its query to TypeScript. Thin glue: the sign-in itself (PKCE, state, tokens) is in TS.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::State;

#[derive(Default)]
pub struct Redirect(Mutex<Option<TcpListener>>);

/// The page the browser shows after signing in.
const DONE_PAGE: &str = "<!doctype html><meta charset=utf-8><title>malplan</title><p style=\"font:16px sans-serif;margin:40px\">로그인을 마쳤습니다. 이 창을 닫고 malplan으로 돌아가세요.</p>";

/// How long a sign-in may take in the browser.
const WAIT: Duration = Duration::from_secs(300);

/// Opens the listener and returns its port. A second call replaces the first listener.
#[tauri::command]
pub fn oauth_listen(state: State<Redirect>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    *state.0.lock().map_err(|e| e.to_string())? = Some(listener);

    Ok(port)
}

/// Waits for the redirect and returns its query ("code=…&state=…" or "error=…"). Requests without either (a favicon)
/// get an empty answer and the wait goes on.
#[tauri::command(async)]
pub fn oauth_wait(state: State<Redirect>) -> Result<String, String> {
    let listener = state.0.lock().map_err(|e| e.to_string())?.take().ok_or("no sign-in in progress")?;

    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    let started = Instant::now();

    while started.elapsed() < WAIT {
        match listener.accept() {
            Ok((mut stream, _)) => {
                stream.set_nonblocking(false).map_err(|e| e.to_string())?;
                stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|e| e.to_string())?;

                let mut line = String::new();

                BufReader::new(&stream).read_line(&mut line).map_err(|e| e.to_string())?;

                if let Some(query) = redirect_query(&line) {
                    let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\nContent-Length: {}\r\n\r\n{DONE_PAGE}", DONE_PAGE.len());

                    return Ok(query);
                }

                let _ = write!(stream, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    }

    Err("sign-in timed out".into())
}

/// "GET /?code=1&state=2 HTTP/1.1" gives "code=1&state=2"; only a redirect carrying a code or an error counts.
fn redirect_query(request_line: &str) -> Option<String> {
    let target = request_line.strip_prefix("GET ")?.split(' ').next()?;
    let query = target.split_once('?')?.1;

    query.split('&').any(|pair| pair.starts_with("code=") || pair.starts_with("error=")).then(|| query.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_a_redirect_with_a_code_or_an_error_is_taken() {
        assert_eq!(redirect_query("GET /?state=s&code=4%2F0A HTTP/1.1\r\n"), Some("state=s&code=4%2F0A".into()));
        assert_eq!(redirect_query("GET /?error=access_denied&state=s HTTP/1.1"), Some("error=access_denied&state=s".into()));
        assert_eq!(redirect_query("GET /favicon.ico HTTP/1.1"), None);
        assert_eq!(redirect_query("POST /?code=1 HTTP/1.1"), None);
        assert_eq!(redirect_query("GET /?decode=1 HTTP/1.1"), None);
    }
}
