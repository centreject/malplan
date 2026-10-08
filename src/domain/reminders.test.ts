import { expect, test } from "vitest";
import type { Item } from "./item";
import { dueReminders } from "./reminders";

const today = "2026-10-08";

function item(id: string, fields: Partial<Item>): Item {
  return {
    id,
    title: id,
    kind: "event",
    categoryId: "c",
    when: { kind: "single", date: today },
    time: { kind: "anytime" },
    done: [],
    ...fields,
  };
}

const at = (hour: number, minute = 0) => hour * 60 + minute;

test("exact time: default lead before the start, once, inside the window", () => {
  const meeting = item("meeting", { time: { kind: "exact", start: { hour: 14, minute: 0 } } });

  expect(dueReminders([meeting], today, at(13, 49), at(13, 50), 10).map((r) => r.key)).toEqual(["meeting@2026-10-08"]);
  expect(dueReminders([meeting], today, at(13, 50), at(13, 51), 10)).toEqual([]);
});

test("an item's own lead wins over the default", () => {
  const meeting = item("meeting", { time: { kind: "exact", start: { hour: 14, minute: 0 } }, remindMinutes: 60 });

  expect(dueReminders([meeting], today, at(12, 59), at(13, 0), 10)).toHaveLength(1);
});

test("'a day before' fires on the previous day", () => {
  const exam = item("exam", {
    when: { kind: "single", date: "2026-10-09" },
    time: { kind: "exact", start: { hour: 9, minute: 0 } },
    remindMinutes: 1440,
  });

  expect(dueReminders([exam], today, at(8, 59), at(9, 0), 10).map((r) => r.key)).toEqual(["exam@2026-10-09"]);
});

test("slot items fire when the slot starts", () => {
  const dinner = item("dinner", { time: { kind: "slot", slot: "dinner" } });

  expect(dueReminders([dinner], today, at(17, 59), at(18, 0), 10)).toHaveLength(1);
});

test("undecided items: one morning summary", () => {
  const items = [item("a", { time: { kind: "undecided" } }), item("b", { time: { kind: "undecided" } })];
  const due = dueReminders(items, today, at(7, 59), at(8, 0), 10);

  expect(due).toEqual([{ key: "undecided@2026-10-08", title: "오늘 시간 미정 2건", body: "a, b" }]);
});

test("done occurrences and anytime items never fire", () => {
  const done = item("done", { kind: "task", time: { kind: "exact", start: { hour: 14, minute: 0 } }, done: [today] });
  const any = item("any", { time: { kind: "anytime" } });

  expect(dueReminders([done, any], today, 0, at(23, 59), 10)).toEqual([]);
});

test("message names the time and place", () => {
  const meeting = item("회의", { time: { kind: "exact", start: { hour: 14, minute: 30 } }, place: "3층" });

  expect(dueReminders([meeting], today, at(14, 19), at(14, 20), 10)[0]).toEqual({
    key: "회의@2026-10-08",
    title: "회의",
    body: "14:30 · 3층 (10분 후)",
  });
});
