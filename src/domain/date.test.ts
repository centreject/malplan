import { describe, expect, test } from "vitest";
import { addMonths, isRealDate } from "./date";

describe("addMonths", () => {
  test("clamps to the end of a shorter month and crosses years both ways", () => {
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2026-10-05", 3)).toBe("2027-01-05");
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-15");
  });
});

test("isRealDate: only days that exist, in YYYY-MM-DD", () => {
  expect(isRealDate("2028-02-29")).toBe(true);
  expect(isRealDate("2026-02-29")).toBe(false);
  expect(isRealDate("2026-02-31")).toBe(false);
  expect(isRealDate("2026-13-01")).toBe(false);
  expect(isRealDate("2026-1-05")).toBe(false);
});
