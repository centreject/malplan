import type { Category, Item } from "./item";
import { ALL_TAB_ID, type CalendarTab } from "./tabs";

/** Where items of a deleted category go. Slot 0 = the theme's neutral ink. */
export const UNCATEGORIZED_ID = "uncategorized";

const SLOTS = [1, 2, 3, 4, 5, 6];

export function addCategory(categories: Category[], id: string): Category[] {
  const uses = (slot: number) => categories.filter((c) => c.colorSlot === slot).length;
  const slot = SLOTS.reduce((best, s) => (uses(s) < uses(best) ? s : best));

  return [...categories, { id, name: "새 분류", colorSlot: slot }];
}

export function renameCategory(categories: Category[], id: string, name: string): Category[] {
  const trimmed = name.trim();

  return trimmed === "" ? categories : categories.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
}

export function recolorCategory(categories: Category[], id: string, slot: number): Category[] {
  return SLOTS.includes(slot) ? categories.map((c) => (c.id === id ? { ...c, colorSlot: slot } : c)) : categories;
}

export type Organized = { categories: Category[]; tabs: CalendarTab[]; items: Item[] };

/** Deletes a category: its items move to 미분류 (created on demand) and every tab drops it. */
export function deleteCategory(categories: Category[], tabs: CalendarTab[], items: Item[], id: string): Organized {
  if (id === UNCATEGORIZED_ID) {
    return { categories, tabs, items };
  }

  const moved = items.some((item) => item.categoryId === id);
  const remaining = categories.filter((c) => c.id !== id);
  const needsUncategorized = moved && !remaining.some((c) => c.id === UNCATEGORIZED_ID);

  return {
    categories: needsUncategorized
      ? [...remaining, { id: UNCATEGORIZED_ID, name: "미분류", colorSlot: 0 }]
      : remaining,
    tabs: tabs.map((t) =>
      t.id === ALL_TAB_ID || t.categoryIds === undefined
        ? t
        : { ...t, categoryIds: t.categoryIds.filter((c) => c !== id) },
    ),
    items: items.map((item) => (item.categoryId === id ? { ...item, categoryId: UNCATEGORIZED_ID } : item)),
  };
}
