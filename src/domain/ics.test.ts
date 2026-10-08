import { expect, test } from "vitest";
import { toIcs } from "./ics";
import type { Item } from "./item";

const stamp = "20261008T120000Z";

function item(fields: Partial<Item>): Item {
  return {
    id: "x",
    title: "제목",
    kind: "event",
    categoryId: "c",
    when: { kind: "single", date: "2026-10-31" },
    time: { kind: "anytime" },
    done: [],
    ...fields,
  };
}

const lines = (items: Item[]) => toIcs(items, stamp).split("\r\n");

test("calendar envelope with CRLF line endings", () => {
  const text = toIcs([], stamp);

  expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
  expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
});

test("timed event: floating local start and end", () => {
  const out = lines([item({ time: { kind: "exact", start: { hour: 19, minute: 0 }, end: { hour: 21, minute: 30 } }, place: "서울" })]);

  expect(out).toContain("DTSTART:20261031T190000");
  expect(out).toContain("DTEND:20261031T213000");
  expect(out).toContain("LOCATION:서울");
  expect(out).toContain("UID:x@malplan");
});

test("untimed event is all-day; a range ends the day after its last day", () => {
  expect(lines([item({})])).toContain("DTSTART;VALUE=DATE:20261031");
  expect(lines([item({ when: { kind: "range", start: "2026-10-10", end: "2026-10-12" } })])).toContain("DTEND;VALUE=DATE:20261013");
});

test("weekly with until, interval and skipped dates", () => {
  const out = lines([
    item({
      when: {
        kind: "recurring",
        rule: { freq: "weekly", weekdays: [1, 3], interval: 2, start: "2026-10-05", until: "2026-12-28", except: ["2026-10-07"] },
      },
      time: { kind: "exact", start: { hour: 16, minute: 0 } },
    }),
  ]);

  expect(out).toContain("DTSTART:20261005T160000");
  expect(out).toContain("RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261228T235959");
  expect(out).toContain("EXDATE:20261007T160000");
});

test("monthly last Friday and yearly rules", () => {
  expect(lines([item({ when: { kind: "recurring", rule: { freq: "monthly", nth: -1, weekday: 5, start: "2026-10-01" } } })]))
    .toContain("RRULE:FREQ=MONTHLY;BYDAY=-1FR");
  expect(lines([item({ when: { kind: "recurring", rule: { freq: "yearly", month: 3, day: 2, start: "2026-01-01" } } })]))
    .toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=2");
});

test("undated task becomes a VTODO; text is escaped", () => {
  const out = lines([item({ kind: "task", when: { kind: "none" }, title: "책, 반납; 하기", note: "줄1\n줄2" })]);

  expect(out).toContain("BEGIN:VTODO");
  expect(out).toContain("SUMMARY:책\\, 반납\\; 하기");
  expect(out).toContain("DESCRIPTION:줄1\\n줄2");
});

test("long lines are folded at 75 octets", () => {
  const text = toIcs([item({ title: "가".repeat(60) })], stamp);
  const longest = Math.max(...text.split("\r\n").map((line) => new TextEncoder().encode(line).length));

  expect(longest).toBeLessThanOrEqual(75);
  expect(text).toContain("\r\n ");
});
