export const THEMES = [
  { id: "bus", name: "버스 안내판" },
  { id: "desk", name: "탁상달력" },
  { id: "standard", name: "기본" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "malplan.theme";

export function loadTheme(): ThemeId {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);

    return THEMES.find((theme) => theme.id === saved)?.id ?? "bus";
  } catch {
    return "bus";
  }
}

export function saveTheme(theme: ThemeId): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage unavailable: theme still applies for this session.
  }
}
