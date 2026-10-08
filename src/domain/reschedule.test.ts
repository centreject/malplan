import { describe, expect, test } from "vitest";
import type { Item } from "./item";
import { quickTargets, reschedule } from "./reschedule";

// 2026-10-08 is a Thursday.
const today = "2026-10-08";

function task(id: string, when: Item["when"]): Item {
  return { id, title: id, kind: "task", categoryId: "c", when, time: { kind: "anytime" }, done: [] };
}

describe("quickTargets", () => {
  test("today, tomorrow, this weekend, next Monday", () => {
    expect(quickTargets(today)).toEqual({
      today: "2026-10-08",
      tomorrow: "2026-10-09",
      weekend: "2026-10-10",
      nextMonday: "2026-10-12",
    });
  });

  test("on a weekend day, 'this weekend' is today", () => {
    expect(quickTargets("2026-10-10").weekend).toBe("2026-10-10");
    expect(quickTargets("2026-10-11").weekend).toBe("2026-10-11");
  });

  test("on a Monday, next Monday is a week away", () => {
    expect(quickTargets("2026-10-12").nextMonday).toBe("2026-10-19");
  });
});

describe("reschedule", () => {
  test("a single-date task moves to the target", () => {
    const result = reschedule([task("a", { kind: "single", date: "2026-10-01" })], ["a"], "2026-10-09", today, () => "new");

    expect(result[0]?.when).toEqual({ kind: "single", date: "2026-10-09" });
  });

  test("a range keeps its length", () => {
    const result = reschedule(
      [task("a", { kind: "range", start: "2026-10-01", end: "2026-10-03" })],
      ["a"],
      "2026-10-09",
      today,
      () => "new",
    );

    expect(result[0]?.when).toEqual({ kind: "range", start: "2026-10-07", end: "2026-10-09" });
  });

  test("a recurring task skips its missed occurrences and gets one copy on the target", () => {
    const weekly = task("w", { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-09-20" } });
    const result = reschedule([weekly], ["w"], "2026-10-09", today, () => "copy");

    expect(result).toHaveLength(2);
    expect(result[0]?.when).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", weekdays: [3], start: "2026-09-20", except: ["2026-09-23", "2026-09-30", "2026-10-07"] },
    });
    expect(result[1]).toEqual({ ...weekly, id: "copy", when: { kind: "single", date: "2026-10-09" } });
  });

  test("items not selected are untouched", () => {
    const other = task("b", { kind: "single", date: "2026-10-01" });

    expect(reschedule([other], ["a"], "2026-10-09", today, () => "new")).toEqual([other]);
  });
});
