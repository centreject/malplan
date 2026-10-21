import { invoke, isTauri } from "@tauri-apps/api/core";
import { TrayIcon } from "@tauri-apps/api/tray";
import { register, unregister, type ShortcutEvent } from "@tauri-apps/plugin-global-shortcut";
import * as v from "valibot";
import { parseStored, readStored, saveStored } from "../storage/localStore";

/** Always-on window behaviour. Autostart is not stored here: the OS holds the truth. */
const AppSettingsSchema = v.object({
  tray: v.optional(v.boolean(), true),
  closeToTray: v.optional(v.boolean(), true),
  shortcut: v.optional(v.boolean(), true),
  /** Accelerator for the global shortcut, as the plugin parses it ("CommandOrControl+Alt+Space"). */
  combo: v.optional(v.string(), "CommandOrControl+Alt+Space"),
});

export type AppSettings = v.InferOutput<typeof AppSettingsSchema>;

/** "CommandOrControl+Alt+KeyK" as the user sees it: "Ctrl+Alt+K". */
export function shortcutLabel(combo: string): string {
  return combo
    .split("+")
    .map((part) => (part === "CommandOrControl" ? "Ctrl" : part.replace(/^(?:Key|Digit)(.)$/, "$1")))
    .join("+");
}

type KeyPress = { code: string; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean };

/** A pressed combination as an accelerator, or undefined until it has a modifier and a non-modifier key. */
export function comboFromKey(key: KeyPress): string | undefined {
  const modifiers = [key.ctrlKey && "CommandOrControl", key.altKey && "Alt", key.shiftKey && "Shift", key.metaKey && "Super"].filter(
    (part): part is string => part !== false,
  );

  if (modifiers.length === 0 || key.code === "" || /^(?:Control|Alt|Shift|Meta|OS)(?:Left|Right)?$/.test(key.code)) {
    return undefined;
  }

  return [...modifiers, key.code].join("+");
}

const STORAGE_KEY = "malplan.appSettings";

/** Parses the stored JSON; anything missing or malformed falls back to defaults. */
export function parseAppSettings(raw: string | null): AppSettings {
  return parseStored(raw, AppSettingsSchema, v.parse(AppSettingsSchema, {}));
}

export function loadAppSettings(): AppSettings {
  return parseAppSettings(readStored(STORAGE_KEY));
}

export function saveAppSettings(settings: AppSettings): void {
  saveStored(STORAGE_KEY, settings);
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

/** The combo this app holds now, so a change releases the old one. */
let registered: string | undefined;

async function registerShortcut(enabled: boolean, combo: string): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }

  if (registered !== undefined) {
    await unregister(registered).catch(() => undefined);
    registered = undefined;
  }

  if (!enabled) {
    return null;
  }

  try {
    await register(combo, focusQuickAdd);
    registered = combo;

    return null;
  } catch {
    return `${shortcutLabel(combo)}를 다른 프로그램이 이미 쓰고 있어 등록하지 못했습니다. 다른 조합으로 바꿔 보세요.`;
  }
}

let latestShortcut: Promise<string | null> = Promise.resolve(null);

/** Error message from the latest shortcut registration (null when fine). Waits if one is in flight. */
export function shortcutStatus(): Promise<string | null> {
  return latestShortcut;
}

/** Registers or releases the global shortcut. Resolves to an error message when the combo is taken. */
export function applyShortcut(enabled: boolean, combo: string): Promise<string | null> {
  // Queued, so a quick change never races the previous unregister.
  latestShortcut = latestShortcut.then(() => registerShortcut(enabled, combo));

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
  const shortcut = applyShortcut(settings.shortcut, settings.combo);

  await applyWindowBehaviour(settings);
  await shortcut;
}
