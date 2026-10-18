import { describe, expect, test } from "vitest";
import { weekLabel, weekStartOf } from "./weeks";

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
