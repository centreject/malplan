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
