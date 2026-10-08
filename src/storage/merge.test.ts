import { describe, expect, test } from "vitest";
import { applyChanges, emptyState, materialize } from "./merge";
import type { Change, Json } from "./schema";

const ch = (ts: number, device: string, field: string, value: Json, id = "i1"): Change => ({
  ts, device, entity: "item", id, field, value,
});

const fieldsOf = (changes: Change[]) => materialize(applyChanges(emptyState, changes)).item;

describe("field-level last-writer-wins", () => {
  test("different fields from different devices both survive", () => {
    expect(fieldsOf([ch(1, "A", "time", "09:00"), ch(2, "B", "done", ["done"])])).toEqual([
      { id: "i1", fields: { time: "09:00", done: ["done"] } },
    ]);
  });

  test("same field: later ts wins regardless of arrival order", () => {
    expect(fieldsOf([ch(5, "B", "title", "new"), ch(3, "A", "title", "old")])).toEqual([
      { id: "i1", fields: { title: "new" } },
    ]);
  });

  test("equal ts: larger deviceId wins", () => {
    expect(fieldsOf([ch(5, "B", "title", "b"), ch(5, "A", "title", "a")])[0]?.fields).toEqual({ title: "b" });
    expect(fieldsOf([ch(5, "A", "title", "a"), ch(5, "B", "title", "b")])[0]?.fields).toEqual({ title: "b" });
  });

  const changes = [
    ch(1, "A", "title", "a1"), ch(2, "B", "title", "b2"), ch(2, "A", "title", "a2"),
    ch(3, "A", "place", "x"), ch(1, "B", "place", "y"), ch(4, "B", "_deleted", true, "i2"),
    ch(3, "A", "title", "i2", "i2"), ch(7, "A", "note", "n"),
  ];

  test("order-independent", () => {
    const expected = applyChanges(emptyState, changes);

    for (let shift = 1; shift < changes.length; shift++) {
      const rotated = [...changes.slice(shift), ...changes.slice(0, shift)];

      expect(applyChanges(emptyState, rotated)).toEqual(expected);
      expect(applyChanges(emptyState, rotated.toReversed())).toEqual(expected);
    }
  });

  test("batching does not matter", () => {
    const split = applyChanges(applyChanges(emptyState, changes.slice(0, 3)), changes.slice(3));

    expect(split).toEqual(applyChanges(emptyState, changes));
  });

  test("idempotent", () => {
    const once = applyChanges(emptyState, changes);

    expect(applyChanges(once, changes)).toEqual(once);
  });

  test("does not mutate the input state", () => {
    const before = applyChanges(emptyState, [ch(1, "A", "title", "a")]);
    applyChanges(before, [ch(2, "A", "title", "b")]);

    expect(materialize(before).item[0]?.fields).toEqual({ title: "a" });
  });
});

describe("deletion (tombstone vs edit, decided by ts)", () => {
  test("tombstoned entities are removed from the materialized view", () => {
    expect(fieldsOf([ch(1, "A", "title", "x"), ch(2, "A", "_deleted", true)])).toEqual([]);
  });

  test("an edit older than the tombstone does not resurrect, even if it arrives later", () => {
    expect(fieldsOf([ch(2, "A", "_deleted", true), ch(1, "B", "title", "late sync")])).toEqual([]);
  });

  test("an edit newer than the tombstone resurrects the entity with all its fields", () => {
    expect(fieldsOf([ch(1, "A", "title", "x"), ch(2, "A", "_deleted", true), ch(3, "B", "done", ["done"])])).toEqual([
      { id: "i1", fields: { title: "x", done: ["done"] } },
    ]);
  });

  test("keys that collide with Object.prototype are stored as plain data", () => {
    const view = fieldsOf([ch(1, "A", "__proto__", { polluted: true }, "toString")]);

    expect(view[0]?.id).toBe("toString");
    expect(Object.hasOwn(view[0]?.fields ?? {}, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(view[0]?.fields)).toBe(Object.prototype);
  });
});

test("groups by entity kind and sorts by id", () => {
  const view = materialize(applyChanges(emptyState, [
    { ts: 1, device: "A", entity: "category", id: "c1", field: "name", value: "업무" },
    ch(1, "A", "title", "b", "b"),
    ch(1, "A", "title", "a", "a"),
  ]));

  expect(view.item.map((r) => r.id)).toEqual(["a", "b"]);
  expect(view.category).toEqual([{ id: "c1", fields: { name: "업무" } }]);
  expect(view.tab).toEqual([]);
  expect(view.settings).toEqual([]);
});
