// Categories and tabs in localStorage until the sync engine replaces this.
import * as v from "valibot";
import type { Category } from "../domain/item";
import type { CalendarTab } from "../domain/tabs";

const CategoriesSchema = v.array(v.object({ id: v.string(), name: v.string(), colorSlot: v.number() }));

const TabsSchema = v.array(
  v.pipe(
    v.object({ id: v.string(), name: v.string(), categoryIds: v.optional(v.array(v.string())) }),
    v.transform((t): CalendarTab => ({ id: t.id, name: t.name, categoryIds: t.categoryIds })),
  ),
);

const CATEGORIES_KEY = "malplan.categories";

const TABS_KEY = "malplan.tabs";

function load<T>(key: string, schema: v.GenericSchema<unknown, T>, seed: T): T {
  try {
    const saved = window.localStorage.getItem(key);

    if (saved === null) {
      return seed;
    }

    const parsed = v.safeParse(schema, JSON.parse(saved));

    return parsed.success ? parsed.output : seed;
  } catch {
    return seed;
  }
}

function save<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: changes still apply for this session.
  }
}

export const loadCategories = (seed: Category[]) => load(CATEGORIES_KEY, CategoriesSchema, seed);

export const saveCategories = (categories: Category[]) => save(CATEGORIES_KEY, categories);

export const loadTabs = (seed: CalendarTab[]) => load(TABS_KEY, TabsSchema, seed);

export const saveTabs = (tabs: CalendarTab[]) => save(TABS_KEY, tabs);
