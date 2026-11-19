// Maps the app's board (items, categories, tabs) to sync-store entities and back.
// Every top-level field of an entity is one sync field, so two devices editing
// different fields of the same item both win. An item's completions are one field per date
// ("done:2026-11-05"), so two devices ticking different days of a repeating task both count.
import * as v from "valibot";
import { UNCATEGORIZED_ID, addNamedCategory } from "../domain/categories";
import type { Category, Item } from "../domain/item";
import { ALL_TAB_ID, type CalendarTab } from "../domain/tabs";
import type { Entities, EntityRecord } from "./merge";
import { DELETED, type EntityKind, type Json } from "./schema";
import type { FieldWrite } from "./store";

export type Board = { items: Item[]; categories: Category[]; tabs: CalendarTab[] };

export type BoardChange = { entity: EntityKind; id: string; field: string; value: Json; remove: boolean };

const DoneListSchema = v.array(v.string());

/** Prefix of an item's per-date completion fields. */
const DONE = "done:";

/**
 * An item's `done` list from its fields. The whole-list `done` field is what versions before 0.2.7 wrote; a
 * per-date field, once written (true, or null when unticked), overrides it for that date.
 */
function doneOf(fields: Record<string, Json>): string[] {
  const legacy = v.is(DoneListSchema, fields.done) ? fields.done : [];
  const ticked = Object.entries(fields).flatMap(([field, value]) => (field.startsWith(DONE) && value === true ? [field.slice(DONE.length)] : []));

  return [...new Set([...legacy.filter((key) => !(`${DONE}${key}` in fields)), ...ticked])];
}

function withDone(record: EntityRecord): EntityRecord {
  const fields = Object.fromEntries(Object.entries(record.fields).filter(([field]) => !field.startsWith(DONE)));

  return { id: record.id, fields: { ...fields, done: doneOf(record.fields) } };
}

const ALL_TAB: CalendarTab = { id: ALL_TAB_ID, name: "전체", categoryIds: undefined };

const IsoDateSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));

const WeekdaySchema = v.picklist([0, 1, 2, 3, 4, 5, 6]);

const ClockSchema = v.object({ hour: v.number(), minute: v.number() });

const RuleBase = {
  start: IsoDateSchema,
  until: v.exactOptional(IsoDateSchema),
  interval: v.exactOptional(v.number()),
  except: v.exactOptional(v.array(IsoDateSchema)),
};

const RecurrenceSchema = v.union([
  v.object({ ...RuleBase, freq: v.literal("daily") }),
  v.object({ ...RuleBase, freq: v.literal("weekly"), weekdays: v.array(WeekdaySchema) }),
  v.object({ ...RuleBase, freq: v.literal("monthly"), day: v.number() }),
  v.object({ ...RuleBase, freq: v.literal("monthly"), nth: v.number(), weekday: WeekdaySchema }),
  v.object({ ...RuleBase, freq: v.literal("yearly"), month: v.number(), day: v.number() }),
]);

const ItemSchema = v.object({
  id: v.string(),
  title: v.string(),
  kind: v.picklist(["event", "task"]),
  categoryId: v.string(),
  when: v.variant("kind", [
    v.object({ kind: v.literal("single"), date: IsoDateSchema }),
    v.object({ kind: v.literal("range"), start: IsoDateSchema, end: IsoDateSchema }),
    v.object({ kind: v.literal("recurring"), rule: RecurrenceSchema }),
    v.object({ kind: v.literal("none") }),
  ]),
  time: v.variant("kind", [
    v.object({ kind: v.literal("exact"), start: ClockSchema, end: v.exactOptional(ClockSchema) }),
    v.object({ kind: v.literal("slot"), slot: v.picklist(["morning", "lunch", "dinner", "night"]) }),
    v.object({ kind: v.literal("undecided") }),
    v.object({ kind: v.literal("anytime") }),
  ]),
  done: v.array(v.string()),
  place: v.exactOptional(v.string()),
  note: v.exactOptional(v.string()),
  remindMinutes: v.exactOptional(v.number()),
  checklist: v.exactOptional(v.array(v.object({ text: v.string(), done: v.boolean() }))),
});

const CategorySchema = v.object({
  id: v.string(),
  name: v.string(),
  colorSlot: v.number(),
  color: v.exactOptional(v.pipe(v.string(), v.regex(/^#[0-9a-f]{6}$/))),
  order: v.number(),
});

const TabSchema = v.object({
  id: v.string(),
  name: v.string(),
  categoryIds: v.nullable(v.array(v.string())),
  colorSlot: v.exactOptional(v.number()),
  order: v.number(),
});

/** The backup file (설정 → 백업): the board as shown, marked as malplan's. */
const BackupSchema = v.object({
  app: v.literal("malplan"),
  items: v.array(ItemSchema),
  categories: v.array(v.omit(CategorySchema, ["order"])),
  // JSON drops 전체's undefined categoryIds.
  tabs: v.array(v.object({ id: v.string(), name: v.string(), categoryIds: v.exactOptional(v.array(v.string())), colorSlot: v.exactOptional(v.number()) })),
});

export function backupJson(board: Board, exportedAt: string): string {
  return JSON.stringify({ app: "malplan", version: 1, exportedAt, ...board }, null, 2);
}

/** The board in a backup file. Anything else (another file, a damaged record) gives undefined: all or nothing. */
export function parseBackup(text: string): Board | undefined {
  try {
    const parsed = v.safeParse(BackupSchema, JSON.parse(text));

    if (!parsed.success) {
      return undefined;
    }

    const { items, categories, tabs } = parsed.output;

    return { items, categories, tabs: tabs.map((tab) => tabOf(tab.id, tab.name, tab.categoryIds, tab.colorSlot)) };
  } catch {
    return undefined;
  }
}

/**
 * Puts a backup's records back: one with the same id takes the backup's content, a missing one is added, and
 * what the backup does not have (added since) stays. Nothing is deleted, so a wrong file cannot empty the board.
 */
export function restoreBackup(current: Board, backup: Board): Board {
  return {
    items: restoreById(current.items, backup.items),
    categories: restoreById(current.categories, backup.categories),
    tabs: restoreById(current.tabs, backup.tabs),
  };
}

/**
 * Items read from another calendar file. New ones go to the "가져옴" category (made once; the user can rename or
 * recolour it); one already here (the same file imported again, or malplan's own export) is updated in place and
 * keeps its category, as it may have been moved since.
 */
export function addImported(board: Board, imported: Item[], newCategoryId: string): Board {
  const target = addNamedCategory(board.categories, "가져옴", newCategoryId);
  const categoryId = target?.id ?? newCategoryId;
  const incoming = new Map(imported.map((item) => [item.id, item]));
  const known = new Set(board.items.map((item) => item.id));

  const items = board.items.map((item) => {
    const update = incoming.get(item.id);

    return update === undefined ? item : keepLocal(item, update);
  });

  return {
    ...board,
    categories: target?.categories ?? board.categories,
    // One per id: a file can repeat a UID.
    items: [...items, ...[...incoming.values()].flatMap((item) => (known.has(item.id) ? [] : [{ ...item, categoryId }]))],
  };
}

/** A calendar file has no checklist or reminder, and its completion only when it says so: those stay as they were here. */
function keepLocal(current: Item, update: Item): Item {
  const merged: Item = { ...update, categoryId: current.categoryId, done: [...new Set([...current.done, ...update.done])] };

  if (current.checklist !== undefined) {
    merged.checklist = current.checklist;
  }

  if (current.remindMinutes !== undefined) {
    merged.remindMinutes = current.remindMinutes;
  }

  return merged;
}

/** "완전히 되돌리기": the board becomes the backup; whatever it does not hold is deleted. 전체 stays first. */
export function restoreExactly(backup: Board): Board {
  return { ...backup, tabs: [ALL_TAB, ...backup.tabs.filter((tab) => tab.id !== ALL_TAB_ID)] };
}

function tabOf(id: string, name: string, categoryIds: string[] | undefined, colorSlot: number | undefined): CalendarTab {
  const tab: CalendarTab = { id, name, categoryIds };

  if (colorSlot !== undefined) {
    tab.colorSlot = colorSlot;
  }

  return tab;
}

function restoreById<T extends { id: string }>(now: T[], saved: T[]): T[] {
  const restored = new Map(saved.map((record) => [record.id, record]));
  const known = new Set(now.map((record) => record.id));

  return [...now.map((record) => restored.get(record.id) ?? record), ...saved.filter((record) => !known.has(record.id))];
}

/** Field values of each entity, keyed by id. `order` keeps list positions. */
function boardRecords(board: Board): Record<"item" | "category" | "tab", Map<string, Map<string, Json>>> {
  return {
    // `done: []` is written once, with a new item: versions up to 0.2.6 require the field to show the item.
    item: new Map(
      board.items.map(({ id, done, ...fields }) => [
        id,
        new Map<string, Json>([...fieldsOf(fields), ["done", []], ...done.map((key): [string, Json] => [`${DONE}${key}`, true])]),
      ]),
    ),
    category: new Map(board.categories.map(({ id, ...fields }, order) => [id, fieldsOf({ ...fields, order })])),
    tab: new Map(
      board.tabs.map(({ id, name, categoryIds, colorSlot }, order) => [id, fieldsOf({ name, categoryIds: categoryIds ?? null, colorSlot, order })]),
    ),
  };
}

type EntityFields =
  | Omit<Item, "id" | "done">
  | (Omit<Category, "id"> & { order: number })
  | { name: string; categoryIds: string[] | null; colorSlot: number | undefined; order: number };

/** Plain-data round trip: drops undefined fields, which JSON cannot hold. */
function fieldsOf(fields: EntityFields): Map<string, Json> {
  // SAFETY: board values are plain data (strings, numbers, arrays, plain objects); JSON round-trips them.
  const json = JSON.parse(JSON.stringify(fields)) as Record<string, Json>;

  return new Map(Object.entries(json));
}

/** JSON text with sorted keys, so field order never looks like a change. */
function canonical(value: Json): string {
  return JSON.stringify(value, (_key, inner: Json) =>
    inner !== null && !Array.isArray(inner) && inner instanceof Object
      ? Object.fromEntries(Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b)))
      : inner,
  );
}

/**
 * `next` with each item that equals one in `prev` replaced by prev's object. A reload builds every item anew;
 * keeping the unchanged ones lets per-item caches (missed dates) and memoized panes skip them.
 */
export function reuseUnchanged(prev: Board, next: Board): Board {
  const before = new Map(prev.items.map((item) => [item.id, item]));

  return {
    ...next,
    items: next.items.map((item) => {
      const old = before.get(item.id);

      return old !== undefined && itemText(old) === itemText(item) ? old : item;
    }),
  };
}

/** An item as comparable text: key order and absent optional fields do not count. */
function itemText(item: Item): string {
  // SAFETY: items are plain data (strings, numbers, arrays, plain objects); JSON round-trips them.
  return canonical(JSON.parse(JSON.stringify(item)) as Json);
}

/** The minimal set of field writes and removals that turns `prev` into `next`. */
export function boardChanges(prev: Board, next: Board): BoardChange[] {
  const before = boardRecords(prev);
  const after = boardRecords(next);

  return (["category", "tab", "item"] as const).flatMap((entity) => {
    const changes: BoardChange[] = [];

    for (const [id, fields] of after[entity]) {
      const old = before[entity].get(id) ?? new Map<string, Json>();

      for (const field of new Set([...fields.keys(), ...old.keys()])) {
        const value = fields.get(field) ?? null;

        if (canonical(value) !== canonical(old.get(field) ?? null)) {
          changes.push({ entity, id, field, value, remove: false });
        }
      }
    }

    for (const id of before[entity].keys()) {
      if (!after[entity].has(id)) {
        changes.push({ entity, id, field: "", value: null, remove: true });
      }
    }

    return changes;
  });
}

/** boardChanges as store writes: a removal becomes the DELETED marker. One setMany call per save. */
export function boardWrites(prev: Board, next: Board): FieldWrite[] {
  return boardChanges(prev, next).map(({ entity, id, field, value, remove }) => (remove ? { entity, id, field: DELETED, value: true } : { entity, id, field, value }));
}

export type LoadedBoard = { board: Board; errors: string[] };

/**
 * Rebuilds the board from merged entities. Records that fail validation are skipped and reported. A record missing
 * a required field is skipped quietly: creation writes every field at once, so such a record is an edit that arrived
 * after its entity was deleted and pruned (or was cut off by "그 폴더 데이터만 사용"); the user cannot fix it.
 *
 * An item whose category is gone (deleted on another device, or left out by a folder merge) shows under 미분류, as
 * if its category had been deleted here. Nothing is written until the user changes it.
 */
export function boardFromEntities(entities: Entities): LoadedBoard {
  const errors: string[] = [];

  const parse = <T>(kind: string, schema: v.GenericSchema<unknown, T> & { entries: v.ObjectEntries }, records: EntityRecord[]): T[] =>
    records.flatMap((record) => {
      const fields = Object.fromEntries(Object.entries(record.fields).filter(([, value]) => value !== null));
      const required = Object.entries(schema.entries).filter(([field, entry]) => field !== "id" && entry.type !== "exact_optional");

      if (required.some(([field]) => !(field in fields))) {
        return [];
      }

      const parsed = v.safeParse(schema, { ...fields, id: record.id });

      if (!parsed.success) {
        errors.push(`${kind} ${record.id}: ${parsed.issues[0]?.message ?? "invalid"}`);

        return [];
      }

      return [parsed.output];
    });

  const tabs = parse("tab", TabSchema, entities.tab)
    .toSorted((a, b) => a.order - b.order)
    .map((tab) => tabOf(tab.id, tab.name, tab.categoryIds ?? undefined, tab.colorSlot))
    .filter((tab) => tab.id !== ALL_TAB_ID);

  const categories = parse("category", CategorySchema, entities.category)
    .toSorted((a, b) => a.order - b.order)
    .map(({ order: _order, ...category }): Category => category);

  const known = new Set(categories.map((c) => c.id));

  const items = parse("item", ItemSchema, entities.item.map(withDone)).map((item) =>
    known.has(item.categoryId) ? item : { ...item, categoryId: UNCATEGORIZED_ID },
  );

  const orphaned = items.some((item) => item.categoryId === UNCATEGORIZED_ID) && !known.has(UNCATEGORIZED_ID);

  return {
    board: {
      items,
      categories: orphaned ? [...categories, { id: UNCATEGORIZED_ID, name: "미분류", colorSlot: 0 }] : categories,
      tabs: [ALL_TAB, ...tabs],
    },
    errors,
  };
}
