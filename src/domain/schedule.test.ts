import { describe, expect, test } from "vitest";
import type { Item } from "./item";
import {
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

  test("after today's last item, looks ahead to the next day with a timed item", () => {
    const items = [
      item("past", { time: { kind: "exact", start: { hour: 9, minute: 0 } } }),
      item("untimed-tomorrow", { when: { kind: "single", date: "2026-10-06" }, time: { kind: "anytime" } }),
      item("class", {
        when: { kind: "single", date: "2026-10-07" },
        time: { kind: "exact", start: { hour: 10, minute: 0 } },
      }),
    ];

    const next = nextUp(items, "2026-10-05", 20 * 60);

    expect(next?.occurrence.item.id).toBe("class");
    expect(next?.occurrence.date).toBe("2026-10-07");
    expect(next?.minutesUntil).toBe(4 * 60 + 24 * 60 + 10 * 60);
  });

  test("nothing in the coming week", () => {
    const items = [item("past", { time: { kind: "exact", start: { hour: 9, minute: 0 } } })];

    expect(nextUp(items, "2026-10-05", 20 * 60)).toBeUndefined();
  });
});

test("overdue tasks collapse missed recurring occurrences into one entry", () => {
  const overdue = overdueTasks([mailing], "2026-10-22");

  expect(overdue).toEqual([
    // Wednesdays 9/2 … 10/21 inside the 60-day lookback.
    { item: mailing, latest: "2026-10-21", missed: 8 },
  ]);
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
