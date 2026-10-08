export type CalendarTab = {
  id: string;
  name: string;
  /** undefined = every category (the default "전체" tab). */
  categoryIds: string[] | undefined;
};

/** The default tab: always first, shows everything, cannot be renamed or deleted. */
export const ALL_TAB_ID = "all";

/** "탭 N" with the smallest free N, counting 전체 as 1. */
export function nextTabName(tabs: CalendarTab[]): string {
  const names = new Set(tabs.map((t) => t.name));
  let n = 2;

  while (names.has(`탭 ${n}`)) {
    n += 1;
  }

  return `탭 ${n}`;
}

export function addTab(tabs: CalendarTab[], id: string, name: string, categoryIds: string[]): CalendarTab[] {
  return [...tabs, { id, name: name.trim() || nextTabName(tabs), categoryIds }];
}

export function updateTab(tabs: CalendarTab[], id: string, name: string, categoryIds: string[]): CalendarTab[] {
  return tabs.map((t) =>
    t.id === id && id !== ALL_TAB_ID ? { id, name: name.trim() || t.name, categoryIds } : t,
  );
}

export function deleteTab(tabs: CalendarTab[], id: string): CalendarTab[] {
  return id === ALL_TAB_ID ? tabs : tabs.filter((t) => t.id !== id);
}

/** Moves a tab to `index`, clamped so that 전체 stays first. */
export function moveTab(tabs: CalendarTab[], id: string, index: number): CalendarTab[] {
  const tab = tabs.find((t) => t.id === id);

  if (tab === undefined || id === ALL_TAB_ID) {
    return tabs;
  }

  const rest = tabs.filter((t) => t.id !== id);
  const at = Math.min(Math.max(index, 1), rest.length);

  return [...rest.slice(0, at), tab, ...rest.slice(at)];
}
