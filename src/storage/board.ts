// Maps the app's board (items, categories, tabs) to sync-store entities and back.
// Every top-level field of an entity is one sync field, so two devices editing
// different fields of the same item both win. An item's completions are one field per date
// ("done:2026-11-05"), so two devices ticking different days of a repeating task both count.
import * as v from "valibot";
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
  order: v.number(),
});

/** Field values of each entity, keyed by id. `order` keeps list positions. */
function boardRecords(board: Board): Record<"item" | "category" | "tab", Map<string, Map<string, Json>>> {
  return {
    item: new Map(board.items.map(({ id, done, ...fields }) => [id, new Map([...fieldsOf(fields), ...done.map((key): [string, Json] => [`${DONE}${key}`, true])])])),
    category: new Map(board.categories.map(({ id, ...fields }, order) => [id, fieldsOf({ ...fields, order })])),
    tab: new Map(
      board.tabs.map(({ id, name, categoryIds }, order) => [id, fieldsOf({ name, categoryIds: categoryIds ?? null, order })]),
    ),
  };
}

type EntityFields =
  | Omit<Item, "id" | "done">
  | (Omit<Category, "id"> & { order: number })
  | { name: string; categoryIds: string[] | null; order: number };

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

/** Rebuilds the board from merged entities. Records that fail validation are skipped and reported. */
export function boardFromEntities(entities: Entities): LoadedBoard {
  const errors: string[] = [];

  const parse = <T>(kind: string, schema: v.GenericSchema<unknown, T>, records: EntityRecord[]): T[] =>
    records.flatMap((record) => {
      const fields = Object.fromEntries(Object.entries(record.fields).filter(([, value]) => value !== null));
      const parsed = v.safeParse(schema, { ...fields, id: record.id });

      if (!parsed.success) {
        errors.push(`${kind} ${record.id}: ${parsed.issues[0]?.message ?? "invalid"}`);

        return [];
      }

      return [parsed.output];
    });

  const tabs = parse("tab", TabSchema, entities.tab)
    .toSorted((a, b) => a.order - b.order)
    .map(({ id, name, categoryIds }): CalendarTab => ({ id, name, categoryIds: categoryIds ?? undefined }))
    .filter((tab) => tab.id !== ALL_TAB_ID);

  const categories = parse("category", CategorySchema, entities.category)
    .toSorted((a, b) => a.order - b.order)
    .map(({ order: _order, ...category }): Category => category);

  return {
    board: { items: parse("item", ItemSchema, entities.item.map(withDone)), categories, tabs: [ALL_TAB, ...tabs] },
    errors,
  };
}
