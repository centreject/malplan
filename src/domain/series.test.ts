import { describe, expect, test } from "vitest";
import type { Item } from "./item";
import { expand, type Recurrence } from "./recurrence";
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

/** Every occurrence of the items' series in a window, sorted: what the calendar would show. */
function shown(items: Item[], from: string, to: string): string[] {
  return items.flatMap((item) => (item.when.kind === "recurring" ? expand(item.when.rule, { from, to }) : [])).toSorted();
}

describe("splitting a series keeps every occurrence across month, year and leap-day edges", () => {
  const base = { ...weekly, done: [] };

  test.each<[string, Recurrence, string]>([
    ["every other Wednesday, split across the year end", { freq: "weekly", weekdays: [3], interval: 2, start: "2026-12-02" }, "2026-12-30"],
    ["every 31st, split at the clamped Feb 28", { freq: "monthly", day: 31, start: "2027-01-31" }, "2027-02-28"],
    ["every last Friday, split in a leap February", { freq: "monthly", nth: -1, weekday: 5, start: "2027-11-26" }, "2028-02-25"],
    ["every two months, split across the year end", { freq: "monthly", day: 15, interval: 2, start: "2026-11-15" }, "2027-01-15"],
    ["every Feb 29, split in a leap year", { freq: "yearly", month: 2, day: 29, start: "2024-02-29" }, "2028-02-29"],
    ["every third day, split after Feb 29", { freq: "daily", interval: 3, start: "2028-02-23" }, "2028-03-03"],
  ])("this and following: %s", (_name, rule, date) => {
    const original: Item = { ...base, when: { kind: "recurring", rule } };
    const before = shown([original], "2024-01-01", "2030-12-31");

    expect(before).toContain(date);

    const split = editOccurrence([original], original, { ...original, title: "바뀜" }, date, "future", newId);

    expect(shown(split, "2024-01-01", "2030-12-31")).toEqual(before);
    expect(shown(split.filter((item) => item.title === "바뀜"), "2024-01-01", "2030-12-31")).toEqual(before.filter((d) => d >= date));
  });

  test("deleting this and following keeps only the earlier occurrences, across a year end", () => {
    const original: Item = { ...base, when: { kind: "recurring", rule: { freq: "monthly", day: 31, start: "2026-10-31" } } };
    const kept = deleteOccurrence([original], original, "2027-01-31", "future");

    expect(shown(kept, "2026-01-01", "2028-12-31")).toEqual(["2026-10-31", "2026-11-30", "2026-12-31"]);
  });

  test("skipping two occurrences one after another keeps both skips", () => {
    const once = deleteOccurrence([weekly], weekly, "2026-10-21", "this");
    const twice = deleteOccurrence(once, once[0] ?? weekly, "2026-10-14", "this");

    expect(shown(twice, "2026-10-01", "2026-10-31")).toEqual(["2026-10-07", "2026-10-28"]);
  });

  test("editing one occurrence keeps only that occurrence's done mark on the copy", () => {
    const [series, single] = editOccurrence([weekly], weekly, edited, "2026-10-21", "this", newId);

    expect(single?.done).toEqual(["2026-10-21"]);
    expect(series?.done).toEqual(weekly.done);
    expect(shown([series ?? weekly], "2026-10-01", "2026-10-31")).toEqual(["2026-10-07", "2026-10-14", "2026-10-28"]);
  });
});
