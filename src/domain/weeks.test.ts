import { describe, expect, test } from "vitest";
import { weekLabel, weekStartOf, weeksOfMonth } from "./weeks";

describe("weekStartOf", () => {
  test("goes back to the chosen start day", () => {
    expect(weekStartOf("2026-10-01", 1)).toBe("2026-09-28");
    expect(weekStartOf("2026-10-05", 1)).toBe("2026-10-05");
    expect(weekStartOf("2026-10-01", 0)).toBe("2026-09-27");
  });
});

describe("weekLabel", () => {
  test("a week belongs to the month of its first day", () => {
    // Monday weeks: 9/28-10/4 is September's last (4th) week; October's 1st week starts 10/5.
    expect(weekLabel("2026-10-01", 1)).toEqual({ month: 9, nth: 4 });
    expect(weekLabel("2026-10-05", 1)).toEqual({ month: 10, nth: 1 });
    expect(weekLabel("2026-10-18", 1)).toEqual({ month: 10, nth: 2 });
  });

  test("other start days", () => {
    expect(weekLabel("2026-10-04", 0)).toEqual({ month: 10, nth: 1 });
  });
});

describe("weeksOfMonth", () => {
  test("the first days of the weeks that belong to a month", () => {
    // Monday weeks: October 2026's weeks start 10/5, 10/12, 10/19, 10/26.
    expect(weeksOfMonth(2026, 10, 1)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    // Sunday weeks: 10/4 … 10/25.
    expect(weeksOfMonth(2026, 10, 0)).toEqual(["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25"]);
    // A month starting on the start day has five: June 2026 begins on a Monday.
    expect(weeksOfMonth(2026, 6, 1)).toHaveLength(5);
  });
});
