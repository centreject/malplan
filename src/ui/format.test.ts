import { expect, test } from "vitest";
import { recurrenceLabel } from "./format";

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
