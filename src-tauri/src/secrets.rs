//! Secrets (the Google sign-in token, API keys) in the Windows Credential Manager instead of app storage.
//! Thin glue: TypeScript decides what to keep; names are limited so the frontend can only reach the app's own entries.

use keyring::{Entry, Error};

/// Every entry is under this service, so other programs' credentials are out of reach.
const SERVICE: &str = "malplan";

fn entry(name: &str) -> Result<Entry, String> {
    let valid = !name.is_empty() && name.len() <= 40 && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-');

    if !valid {
        return Err(format!("invalid secret name: {name}"));
    }

    Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

/// The stored value, or None when there is none.
#[tauri::command]
pub fn secret_get(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn secret_set(name: &str, value: &str) -> Result<(), String> {
    entry(name)?.set_password(value).map_err(|e| e.to_string())
}

/// Removing what is not there is not an error.
#[tauri::command]
pub fn secret_delete(name: &str) -> Result<(), String> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_apps_own_names_are_accepted() {
        assert!(entry("google-refresh-token").is_ok());
        assert!(entry("").is_err());
        assert!(entry("Other/App").is_err());
        assert!(entry(&"a".repeat(41)).is_err());
    }

    #[test]
    fn a_secret_round_trips_through_the_credential_store() {
        let name = format!("test-{}", std::process::id());

        secret_set(&name, "값").unwrap();
        assert_eq!(secret_get(&name).unwrap(), Some("값".to_string()));
        secret_delete(&name).unwrap();
        assert_eq!(secret_get(&name).unwrap(), None);
        secret_delete(&name).unwrap();
    }
}
