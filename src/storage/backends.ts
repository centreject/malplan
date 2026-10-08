import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Backend } from "./store";

/** A folder on disk (local, NAS share, or a cloud-synced folder), through the Rust sync commands. */
export class FolderBackend implements Backend {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  list() {
    return invoke<string[]>("sync_list", { dir: this.dir });
  }

  async read(name: string) {
    return (await invoke<string | null>("sync_read", { dir: this.dir, name })) ?? undefined;
  }

  write(name: string, content: string) {
    return invoke<void>("sync_write", { dir: this.dir, name, content });
  }

  append(name: string, line: string) {
    return invoke<void>("sync_append", { dir: this.dir, name, line });
  }
}

/** Browser preview only: files live under one localStorage prefix. */
export class LocalStorageBackend implements Backend {
  readonly #prefix: string;

  constructor(prefix: string) {
    this.#prefix = prefix;
  }

  async list() {
    return Object.keys(window.localStorage)
      .filter((key) => key.startsWith(this.#prefix))
      .map((key) => key.slice(this.#prefix.length));
  }

  async read(name: string) {
    return window.localStorage.getItem(this.#prefix + name) ?? undefined;
  }

  async write(name: string, content: string) {
    window.localStorage.setItem(this.#prefix + name, content);
  }

  async append(name: string, line: string) {
    await this.write(name, ((await this.read(name)) ?? "") + line);
  }
}

const DIR_KEY = "malplan.syncDir";

const DEVICE_KEY = "malplan.deviceId";

/** The folder this device syncs through; undefined = the app's own data folder. */
export function loadSyncDir(): string | undefined {
  try {
    return window.localStorage.getItem(DIR_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveSyncDir(dir: string | undefined): void {
  try {
    if (dir === undefined) {
      window.localStorage.removeItem(DIR_KEY);
    } else {
      window.localStorage.setItem(DIR_KEY, dir);
    }
  } catch {
    // Storage unavailable: the choice lasts for this session only.
  }
}

/** Stable per-install id that names this device's change log. */
export function deviceId(): string {
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);

    if (saved !== null) {
      return saved;
    }

    const id = crypto.randomUUID().slice(0, 8);

    window.localStorage.setItem(DEVICE_KEY, id);

    return id;
  } catch {
    return "browser";
  }
}

export async function defaultSyncDir(): Promise<string> {
  return invoke<string>("sync_default_dir");
}

/** Folder backend in the desktop app; localStorage in a plain browser. */
export async function openBackend(dir: string | undefined): Promise<Backend> {
  if (!isTauri()) {
    return new LocalStorageBackend("malplan.sync/");
  }

  return new FolderBackend(dir ?? (await defaultSyncDir()));
}
