import { expect, test } from "vitest";
import { leadText, recurrenceLabel, timeLabel } from "./format";

test("reminder leads read the same everywhere", () => {
  expect([5, 60, 90, 120, 1440, 2880].map(leadText)).toEqual(["5분 전", "1시간 전", "90분 전", "2시간 전", "하루 전", "2일 전"]);
});

test("a time that ends after midnight says so", () => {
  expect(timeLabel({ kind: "exact", start: { hour: 22, minute: 0 }, end: { hour: 1, minute: 0 } })).toBe("22시–다음 날 1시");
  expect(timeLabel({ kind: "exact", start: { hour: 9, minute: 30 }, end: { hour: 10, minute: 0 } })).toBe("9:30–10시");
});

test("recurrence labels name the interval", () => {
  expect(recurrenceLabel({ freq: "daily", start: "2026-10-01" })).toBe("매일");
  expect(recurrenceLabel({ freq: "daily", interval: 3, start: "2026-10-01" })).toBe("3일마다");
  expect(recurrenceLabel({ freq: "weekly", weekdays: [1, 4], start: "2026-10-01" })).toBe("매주 월·목");
  expect(recurrenceLabel({ freq: "weekly", weekdays: [3], interval: 2, start: "2026-10-01" })).toBe("격주 수");
  expect(recurrenceLabel({ freq: "weekly", weekdays: [5], interval: 3, start: "2026-10-01" })).toBe("3주마다 금");
  expect(recurrenceLabel({ freq: "monthly", day: 25, start: "2026-10-01" })).toBe("매월 25일");
  expect(recurrenceLabel({ freq: "monthly", day: 10, interval: 3, start: "2026-10-01" })).toBe("3개월마다 10일");
  expect(recurrenceLabel({ freq: "monthly", nth: -1, weekday: 5, start: "2026-10-01" })).toBe("매월 마지막 금요일");
  expect(recurrenceLabel({ freq: "yearly", month: 3, day: 2, start: "2026-10-01", until: "2030-12-31" })).toBe("매년 3/2 (12/31까지)");
});
