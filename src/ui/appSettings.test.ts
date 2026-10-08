import { describe, expect, it } from "vitest";
import { closesToTray, parseAppSettings } from "./appSettings";

describe("parseAppSettings", () => {
  it("defaults: tray on, close to tray, shortcut on", () => {
    expect(parseAppSettings(null)).toEqual({ tray: true, closeToTray: true, shortcut: true });
  });

  it("keeps stored values and fills missing ones", () => {
    expect(parseAppSettings('{"closeToTray":false}')).toEqual({ tray: true, closeToTray: false, shortcut: true });
  });

  it("falls back to defaults on garbage", () => {
    expect(parseAppSettings("not json")).toEqual(parseAppSettings(null));
    expect(parseAppSettings('{"tray":"yes"}')).toEqual(parseAppSettings(null));
  });
});

describe("closesToTray", () => {
  it("never hides to a tray that is not shown", () => {
    expect(closesToTray({ tray: false, closeToTray: true, shortcut: true })).toBe(false);
    expect(closesToTray({ tray: true, closeToTray: true, shortcut: true })).toBe(true);
  });
});
