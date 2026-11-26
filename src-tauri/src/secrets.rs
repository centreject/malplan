//! Secrets (the Google sign-in token, API keys) in the Windows Credential Manager instead of app storage.
//! Thin glue: TypeScript decides what to keep; names are limited so the frontend can only reach the app's own entries.
//! In the Credential Manager they show as "<name>@<app identifier>".

use keyring::{Entry, Error};
use tauri::AppHandle;

/// Every entry is under the app's identifier: other programs' credentials are out of reach, and a test build
/// (another identifier) never touches the installed app's.
fn entry(app: &AppHandle, name: &str) -> Result<Entry, String> {
    entry_in(&app.config().identifier, name)
}

fn entry_in(service: &str, name: &str) -> Result<Entry, String> {
    let valid = !name.is_empty() && name.len() <= 40 && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');

    if !valid {
        return Err(format!("invalid secret name: {name}"));
    }

    Entry::new(service, name).map_err(|e| e.to_string())
}

/// The stored value, or None when there is none.
#[tauri::command]
pub fn secret_get(app: AppHandle, name: &str) -> Result<Option<String>, String> {
    get(&entry(&app, name)?)
}

fn get(entry: &Entry) -> Result<Option<String>, String> {
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(app: AppHandle, name: &str, value: &str) -> Result<(), String> {
    entry(&app, name)?.set_password(value).map_err(|e| e.to_string())
}

/// Removing what is not there is not an error.
#[tauri::command]
pub fn secret_delete(app: AppHandle, name: &str) -> Result<(), String> {
    delete(&entry(&app, name)?)
}

fn delete(entry: &Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_apps_own_names_are_accepted() {
        assert!(entry_in("test", "google-refresh-token").is_ok());
        assert!(entry_in("test", "").is_err());
        assert!(entry_in("test", "Other/App").is_err());
        assert!(entry_in("test", &"a".repeat(41)).is_err());
    }

    #[test]
    fn a_secret_round_trips_through_the_credential_store() {
        let entry = entry_in("com.centreject.malplan.test", &format!("test-{}", std::process::id())).unwrap();

        entry.set_password("값").unwrap();
        assert_eq!(get(&entry).unwrap(), Some("값".to_string()));
        delete(&entry).unwrap();
        assert_eq!(get(&entry).unwrap(), None);
        delete(&entry).unwrap();
    }
}
