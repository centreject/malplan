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

/** Pick a palette slot; clears any custom colour. */
export function recolorCategory(categories: Category[], id: string, slot: number): Category[] {
  return SLOTS.includes(slot)
    ? categories.map((c) => (c.id === id ? { id: c.id, name: c.name, colorSlot: slot } : c))
    : categories;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Any "#rrggbb" colour, stored lower-case. Invalid input changes nothing. */
export function setCustomColor(categories: Category[], id: string, hex: string): Category[] {
  return HEX.test(hex) ? categories.map((c) => (c.id === id ? { ...c, color: hex.toLowerCase() } : c)) : categories;
}

/** Readable text colour on a background, by WCAG relative luminance. */
export function inkOn(hex: string): string {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;

    return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);

  // Contrast with white vs near-black (#111111, luminance ~0.0056): pick the higher.
  return (1.05 / (luminance + 0.05)) >= ((luminance + 0.05) / 0.0556) ? "#ffffff" : "#111111";
}

/** Class that sets --c / --c-ink: a theme palette slot, or the category's own custom colour. */
export function categoryClass(category: Category | undefined): string {
  if (category === undefined) {
    return "cat-0";
  }

  return category.color !== undefined && HEX.test(category.color) && SAFE_ID.test(category.id)
    ? `catc-${category.id}`
    : `cat-${category.colorSlot}`;
}

/** Ids are user/sync data; only these characters may reach a CSS selector. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** One CSS rule per custom-coloured category. */
export function customColorCss(categories: Category[]): string {
  return categories
    .flatMap((c) =>
      c.color !== undefined && HEX.test(c.color) && SAFE_ID.test(c.id) ? [`.catc-${c.id}{--c:${c.color};--c-ink:${inkOn(c.color)}}`] : [],
    )
    .join("");
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
