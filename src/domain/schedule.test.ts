import { describe, expect, test } from "vitest";
import type { Item } from "./item";
import type { Recurrence } from "./recurrence";
import {
  daysAround,
  firstOccurrence,
  formatClock,
  monthCells,
  nextUp,
  occurrencesOn,
  overdueTasks,
  weekDates,
} from "./schedule";

function item(id: string, fields: Partial<Item>): Item {
  return {
    id,
    title: id,
    kind: "event",
    categoryId: "c",
    when: { kind: "single", date: "2026-10-05" },
    time: { kind: "anytime" },
    done: [],
    ...fields,
  };
}

const mailing = item("mailing", {
  kind: "task",
  when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-09-01" } },
  time: { kind: "exact", start: { hour: 16, minute: 0 } },
});

describe("occurrencesOn", () => {
  test("recurring items appear only on matching dates", () => {
    expect(occurrencesOn([mailing], "2026-10-07").map((o) => o.item.id)).toEqual(["mailing"]);
    expect(occurrencesOn([mailing], "2026-10-08")).toEqual([]);
  });

  test("range items appear on every day of the range", () => {
    const trip = item("trip", { when: { kind: "range", start: "2026-10-10", end: "2026-10-12" } });

    expect(occurrencesOn([trip], "2026-10-11")).toHaveLength(1);
    expect(occurrencesOn([trip], "2026-10-13")).toHaveLength(0);
  });

  test("undecided and anytime first, then by time with slots at their hour", () => {
    const items = [
      item("seven", { time: { kind: "exact", start: { hour: 19, minute: 0 } } }),
      item("dinner", { time: { kind: "slot", slot: "dinner" } }),
      item("five", { time: { kind: "exact", start: { hour: 17, minute: 0 } } }),
      item("any", { time: { kind: "anytime" } }),
      item("tbd", { time: { kind: "undecided" } }),
    ];

    expect(occurrencesOn(items, "2026-10-05").map((o) => o.item.id)).toEqual([
      "tbd", "any", "five", "dinner", "seven",
    ]);
  });

  test("a recurring task is done per occurrence", () => {
    const doneOnce = { ...mailing, done: ["2026-10-07"] };

    expect(occurrencesOn([doneOnce], "2026-10-07")[0]?.done).toBe(true);
    expect(occurrencesOn([doneOnce], "2026-10-14")[0]?.done).toBe(false);
  });
});

describe("nextUp", () => {
  test("first not-done timed item at or after now, with minutes until it", () => {
    const items = [
      item("past", { time: { kind: "exact", start: { hour: 9, minute: 0 } } }),
      item("soon", { time: { kind: "exact", start: { hour: 16, minute: 0 } } }),
    ];

    const next = nextUp(items, "2026-10-05", 15 * 60 + 50);

    expect(next?.occurrence.item.id).toBe("soon");
    expect(next?.minutesUntil).toBe(10);
  });

  test("after today's last item there is nothing next: later days are not pulled in", () => {
    const items = [
      item("past", { time: { kind: "exact", start: { hour: 9, minute: 0 } } }),
      item("untimed-tomorrow", { when: { kind: "single", date: "2026-10-06" }, time: { kind: "anytime" } }),
      item("class", {
        when: { kind: "single", date: "2026-10-07" },
        time: { kind: "exact", start: { hour: 10, minute: 0 } },
      }),
    ];

    const next = nextUp(items, "2026-10-05", 20 * 60);

    expect(next).toBeUndefined();
  });

  test("nothing in the coming week", () => {
    const items = [item("past", { time: { kind: "exact", start: { hour: 9, minute: 0 } } })];

    expect(nextUp(items, "2026-10-05", 20 * 60)).toBeUndefined();
  });
});

test("overdue tasks collapse missed recurring occurrences into one entry", () => {
  const overdue = overdueTasks([mailing], "2026-10-22");

  expect(overdue).toEqual([
    // Wednesdays 9/2 … 10/21.
    { item: mailing, latest: "2026-10-21", missed: ["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14", "2026-10-21"] },
  ]);
});

test("unfinished tasks stay overdue however old", () => {
  const old = item("tax", { kind: "task", when: { kind: "single", date: "2025-01-10" } });
  const weekly = item("log", { kind: "task", when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2025-01-01", until: "2025-01-31" } } });

  expect(overdueTasks([old, weekly], "2026-10-22")).toEqual([
    { item: old, latest: "2025-01-10", missed: ["2025-01-10"] },
    { item: weekly, latest: "2025-01-29", missed: ["2025-01-01", "2025-01-08", "2025-01-15", "2025-01-22", "2025-01-29"] },
  ]);
});

test("first occurrence searches ahead past empty months and honours the filter", () => {
  const yearly: Recurrence = { freq: "yearly", month: 3, day: 1, start: "2020-03-01" };
  const wednesdays: Recurrence = { freq: "weekly", weekdays: [3], start: "2026-09-01" };

  expect(firstOccurrence(yearly, "2026-10-22", 400)).toBe("2027-03-01");
  expect(firstOccurrence(yearly, "2026-10-22", 100)).toBeUndefined();
  expect(firstOccurrence(wednesdays, "2026-10-01", 30, (d) => d !== "2026-10-07")).toBe("2026-10-14");
});

test("overdue ignores events and finished tasks", () => {
  const event = item("party", { when: { kind: "single", date: "2026-10-01" } });
  const finished = item("report", { kind: "task", when: { kind: "single", date: "2026-10-01" }, done: ["2026-10-01"] });

  expect(overdueTasks([event, finished], "2026-10-05")).toEqual([]);
});

describe("calendar grids", () => {
  test("week starting Sunday or Monday", () => {
    expect(weekDates("2026-10-05", 0)).toEqual([
      "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10",
    ]);
    expect(weekDates("2026-10-05", 1)[0]).toBe("2026-10-05");
  });

  test("month cells cover whole weeks only", () => {
    const cells = monthCells(2026, 10, 0);

    expect(cells[0]).toBe("2026-09-27");
    expect(cells.at(-1)).toBe("2026-10-31");
    expect(cells).toHaveLength(35);
  });
});

test("clock shows minutes only when present", () => {
  expect(formatClock({ hour: 16, minute: 0 })).toBe("16시");
  expect(formatClock({ hour: 16, minute: 30 })).toBe("16:30");
});

test("days around a center: 3 before, the day, 3 after", () => {
  expect(daysAround("2026-10-10")).toEqual([
    "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13",
  ]);
});
