// Secrets in the Windows Credential Manager (Rust `secrets.rs`). Names: lowercase letters, digits and "-".
import { invoke } from "@tauri-apps/api/core";

export async function readSecret(name: string): Promise<string | undefined> {
  return (await invoke<string | null>("secret_get", { name })) ?? undefined;
}

export function saveSecret(name: string, value: string): Promise<void> {
  return invoke("secret_set", { name, value });
}

export function deleteSecret(name: string): Promise<void> {
  return invoke("secret_delete", { name });
}
