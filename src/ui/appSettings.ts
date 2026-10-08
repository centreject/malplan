import { invoke, isTauri } from "@tauri-apps/api/core";
import { TrayIcon } from "@tauri-apps/api/tray";
import { register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import * as v from "valibot";

/** Always-on window behaviour. Autostart is not stored here: the OS holds the truth. */
const AppSettingsSchema = v.object({
  tray: v.optional(v.boolean(), true),
  closeToTray: v.optional(v.boolean(), true),
  shortcut: v.optional(v.boolean(), true),
});

export type AppSettings = v.InferOutput<typeof AppSettingsSchema>;

export const SHORTCUT = "CommandOrControl+Alt+Space";

export const SHORTCUT_LABEL = "Ctrl+Alt+Space";

const STORAGE_KEY = "malplan.appSettings";

/** Parses the stored JSON; anything missing or malformed falls back to defaults. */
export function parseAppSettings(raw: string | null): AppSettings {
  try {
    const result = v.safeParse(AppSettingsSchema, JSON.parse(raw ?? "{}"));

    if (result.success) {
      return result.output;
    }
  } catch {
    // Not JSON: use defaults.
  }

  return v.parse(AppSettingsSchema, {});
}

export function loadAppSettings(): AppSettings {
  try {
    return parseAppSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseAppSettings(null);
  }
}

export function saveAppSettings(settings: AppSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: settings still apply for this session.
  }
}

/** Closing hides to the tray only while there is a tray icon to come back from. */
export function closesToTray(settings: AppSettings): boolean {
  return settings.tray && settings.closeToTray;
}

/** Rust shows and focuses the window on the same press; here we only move focus to the input. */
function focusQuickAdd(event: ShortcutEvent): void {
  if (event.state === "Pressed") {
    document.getElementById("quick-add-input")?.focus();
  }
}

async function registerShortcut(enabled: boolean): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    await unregister(SHORTCUT);
  } catch {
    // Not registered yet.
  }

  if (!enabled) {
    return null;
  }

  try {
    await register(SHORTCUT, focusQuickAdd);

    return null;
  } catch {
    return `${SHORTCUT_LABEL}를 다른 프로그램이 이미 쓰고 있어 등록하지 못했습니다.`;
  }
}

let latestShortcut: Promise<string | null> = Promise.resolve(null);

/** Error message from the latest shortcut registration (null when fine). Waits if one is in flight. */
export function shortcutStatus(): Promise<string | null> {
  return latestShortcut;
}

/** Registers or releases the global shortcut. Resolves to an error message when the combo is taken. */
export function applyShortcut(enabled: boolean): Promise<string | null> {
  latestShortcut = registerShortcut(enabled);

  return latestShortcut;
}

/** Pushes tray visibility and close behaviour to the native side. */
export async function applyWindowBehaviour(settings: AppSettings): Promise<void> {
  if (!isTauri()) {
    return;
  }

  await invoke("set_close_to_tray", { enabled: closesToTray(settings) });
  await (await TrayIcon.getById("main"))?.setVisible(settings.tray);
}

/** Startup: apply the persisted settings once. Call before the first render so shortcutStatus() sees it. */
export async function applyAppSettings(settings: AppSettings): Promise<void> {
  const shortcut = applyShortcut(settings.shortcut);

  await applyWindowBehaviour(settings);
  await shortcut;
}
