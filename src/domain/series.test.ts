import { describe, expect, test } from "vitest";
import type { Item } from "./item";
import { deleteOccurrence, editOccurrence } from "./series";

const weekly: Item = {
  id: "w",
  title: "우편물",
  kind: "task",
  categoryId: "c",
  when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-10-07" } },
  time: { kind: "exact", start: { hour: 16, minute: 0 } },
  done: ["2026-10-07", "2026-10-21"],
};

const edited: Item = { ...weekly, title: "우편물 (등기)" };

const newId = () => "new";

describe("editOccurrence", () => {
  test("this only: the series skips that date and a single item takes the edit", () => {
    const result = editOccurrence([weekly], weekly, edited, "2026-10-14", "this", newId);

    expect(result).toEqual([
      { ...weekly, when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-10-07", except: ["2026-10-14"] } } },
      { ...edited, id: "new", when: { kind: "single", date: "2026-10-14" }, done: [] },
    ]);
  });

  test("this only keeps an edited date the user picked", () => {
    const moved: Item = { ...edited, when: { kind: "single", date: "2026-10-15" } };
    const result = editOccurrence([weekly], weekly, moved, "2026-10-14", "this", newId);

    expect(result[1]?.when).toEqual({ kind: "single", date: "2026-10-15" });
  });

  test("this and following: the series ends the day before, a new series starts on the date", () => {
    const result = editOccurrence([weekly], weekly, edited, "2026-10-14", "future", newId);

    expect(result).toEqual([
      { ...weekly, when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-10-07", until: "2026-10-13" } }, done: ["2026-10-07"] },
      { ...edited, id: "new", when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-10-14" } }, done: ["2026-10-21"] },
    ]);
  });

  test("this and following from the first occurrence replaces the whole series", () => {
    const result = editOccurrence([weekly], weekly, edited, "2026-10-07", "future", newId);

    expect(result).toEqual([edited]);
  });

  test("all: plain replace", () => {
    expect(editOccurrence([weekly], weekly, edited, "2026-10-14", "all", newId)).toEqual([edited]);
  });
});

describe("deleteOccurrence", () => {
  test("this only adds an exception", () => {
    const result = deleteOccurrence([weekly], weekly, "2026-10-14", "this");

    expect(result[0]?.when).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", weekdays: [3], start: "2026-10-07", except: ["2026-10-14"] },
    });
  });

  test("this and following ends the series the day before", () => {
    const result = deleteOccurrence([weekly], weekly, "2026-10-14", "future");

    expect(result[0]?.when).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", weekdays: [3], start: "2026-10-07", until: "2026-10-13" },
    });
  });

  test("this and following from the start, or all, removes the item", () => {
    expect(deleteOccurrence([weekly], weekly, "2026-10-07", "future")).toEqual([]);
    expect(deleteOccurrence([weekly], weekly, "2026-10-14", "all")).toEqual([]);
  });
});
