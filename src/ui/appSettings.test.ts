import { describe, expect, it } from "vitest";
import { closesToTray, comboFromKey, parseAppSettings, shortcutLabel } from "./appSettings";

const DEFAULT_COMBO = "CommandOrControl+Alt+Space";

describe("parseAppSettings", () => {
  it("defaults: tray on, close to tray, shortcut on", () => {
    expect(parseAppSettings(null)).toEqual({ tray: true, closeToTray: true, shortcut: true, combo: DEFAULT_COMBO });
  });

  it("keeps stored values and fills missing ones", () => {
    expect(parseAppSettings('{"closeToTray":false}')).toEqual({ tray: true, closeToTray: false, shortcut: true, combo: DEFAULT_COMBO });
  });

  it("falls back to defaults on garbage", () => {
    expect(parseAppSettings("not json")).toEqual(parseAppSettings(null));
    expect(parseAppSettings('{"tray":"yes"}')).toEqual(parseAppSettings(null));
  });
});

describe("closesToTray", () => {
  it("never hides to a tray that is not shown", () => {
    expect(closesToTray({ tray: false, closeToTray: true, shortcut: true, combo: DEFAULT_COMBO })).toBe(false);
    expect(closesToTray({ tray: true, closeToTray: true, shortcut: true, combo: DEFAULT_COMBO })).toBe(true);
  });
});

function press(code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>>) {
  return { code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods };
}

describe("comboFromKey", () => {
  it("needs a modifier and a non-modifier key", () => {
    expect(comboFromKey(press("KeyK", {}))).toBeUndefined();
    expect(comboFromKey(press("ShiftLeft", { shiftKey: true }))).toBeUndefined();
    expect(comboFromKey(press("KeyK", { ctrlKey: true, shiftKey: true }))).toBe("CommandOrControl+Shift+KeyK");
    expect(comboFromKey(press("Space", { altKey: true }))).toBe("Alt+Space");
  });

  it("is shown the way people write it", () => {
    expect(shortcutLabel("CommandOrControl+Shift+KeyK")).toBe("Ctrl+Shift+K");
    expect(shortcutLabel("Alt+Digit1")).toBe("Alt+1");
    expect(shortcutLabel(DEFAULT_COMBO)).toBe("Ctrl+Alt+Space");
  });
});
