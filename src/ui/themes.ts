import { readStored, writeStored } from "../storage/localStore";

export const THEMES = [
  {
    id: "bus",
    name: "버스 안내판",
    description: "서울 버스 노선색, 다음 일정까지 남은 시간을 크게",
    swatch: ["#18212d", "#f2b705", "#1b5fb5", "#23803a"],
  },
  {
    id: "desk",
    name: "탁상달력",
    description: "큰 날짜 숫자와 빨간 휴일, 종이 느낌",
    swatch: ["#fbf8f2", "#23201b", "#c8281f", "#2e5aac"],
  },
  {
    id: "standard",
    name: "기본",
    description: "익숙한 캘린더 앱처럼 깔끔하게",
    swatch: ["#ffffff", "#1f2937", "#2563eb", "#e5e7eb"],
  },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "malplan.theme";

export function loadTheme(): ThemeId {
  const saved = readStored(STORAGE_KEY);

  return THEMES.find((theme) => theme.id === saved)?.id ?? "bus";
}

export function saveTheme(theme: ThemeId): void {
  writeStored(STORAGE_KEY, theme);
}

/** Light or dark, or whatever Windows is set to. Each theme has both. */
export const SCHEMES = [
  { id: "light", name: "밝게" },
  { id: "dark", name: "어둡게" },
  { id: "system", name: "시스템 설정 따름" },
] as const;

export type SchemeId = (typeof SCHEMES)[number]["id"];

const SCHEME_KEY = "malplan.scheme";

export function loadScheme(): SchemeId {
  const saved = readStored(SCHEME_KEY);

  return SCHEMES.find((scheme) => scheme.id === saved)?.id ?? "system";
}

export function saveScheme(scheme: SchemeId): void {
  writeStored(SCHEME_KEY, scheme);
}

export function resolvedScheme(scheme: SchemeId, systemDark: boolean): "light" | "dark" {
  return scheme === "system" ? (systemDark ? "dark" : "light") : scheme;
}
