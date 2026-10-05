import { describe, expect, test } from "vitest";
import { expand } from "./recurrence";

describe("weekly", () => {
  test("spec example: every Wednesday until 12/28, entered on 2026-10-05", () => {
    const dates = expand(
      { freq: "weekly", weekdays: [3], start: "2026-10-05", until: "2026-12-28" },
      { from: "2026-01-01", to: "2027-12-31" },
    );

    expect(dates).toEqual([
      "2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28",
      "2026-11-04", "2026-11-11", "2026-11-18", "2026-11-25",
      "2026-12-02", "2026-12-09", "2026-12-16", "2026-12-23",
    ]);
  });

  test("until date is inclusive", () => {
    const dates = expand(
      { freq: "weekly", weekdays: [1], start: "2026-12-14", until: "2026-12-28" },
      { from: "2026-01-01", to: "2027-12-31" },
    );

    expect(dates).toEqual(["2026-12-14", "2026-12-21", "2026-12-28"]);
  });

  test("without until, repeats forever and is bounded by the view range", () => {
    const dates = expand(
      { freq: "weekly", weekdays: [3], start: "2026-10-05" },
      { from: "2026-10-01", to: "2026-10-31" },
    );

    expect(dates).toEqual(["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"]);
  });

  test("several weekdays in one rule", () => {
    const dates = expand(
      { freq: "weekly", weekdays: [1, 4], start: "2026-10-05" },
      { from: "2026-10-05", to: "2026-10-18" },
    );

    expect(dates).toEqual(["2026-10-05", "2026-10-08", "2026-10-12", "2026-10-15"]);
  });

  test("every other week is anchored to the start week", () => {
    const dates = expand(
      { freq: "weekly", weekdays: [3], interval: 2, start: "2026-10-05" },
      { from: "2026-10-01", to: "2026-11-10" },
    );

    expect(dates).toEqual(["2026-10-07", "2026-10-21", "2026-11-04"]);
  });
});

test("daily", () => {
  const dates = expand(
    { freq: "daily", start: "2026-10-30", until: "2026-11-02" },
    { from: "2026-01-01", to: "2027-12-31" },
  );

  expect(dates).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
});

describe("monthly", () => {
  test("on day N", () => {
    const dates = expand(
      { freq: "monthly", day: 15, start: "2026-10-05" },
      { from: "2026-10-01", to: "2026-12-31" },
    );

    expect(dates).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
  });

  test("day 31 falls back to the month's last day", () => {
    const dates = expand(
      { freq: "monthly", day: 31, start: "2027-01-01" },
      { from: "2027-01-01", to: "2027-04-30" },
    );

    expect(dates).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  test("last Friday", () => {
    const dates = expand(
      { freq: "monthly", nth: -1, weekday: 5, start: "2026-10-05" },
      { from: "2026-10-01", to: "2026-11-30" },
    );

    expect(dates).toEqual(["2026-10-30", "2026-11-27"]);
  });

  test("second Tuesday", () => {
    const dates = expand(
      { freq: "monthly", nth: 2, weekday: 2, start: "2026-10-05" },
      { from: "2026-10-01", to: "2026-11-30" },
    );

    expect(dates).toEqual(["2026-10-13", "2026-11-10"]);
  });
});

test("yearly on Feb 29 falls back to Feb 28 in common years", () => {
  const dates = expand(
    { freq: "yearly", month: 2, day: 29, start: "2028-01-01" },
    { from: "2028-01-01", to: "2030-12-31" },
  );

  expect(dates).toEqual(["2028-02-29", "2029-02-28", "2030-02-28"]);
});

test("skipped dates are excluded (e.g. 'this week off')", () => {
  const dates = expand(
    { freq: "weekly", weekdays: [3], start: "2026-10-05", except: ["2026-10-14"] },
    { from: "2026-10-01", to: "2026-10-31" },
  );

  expect(dates).toEqual(["2026-10-07", "2026-10-21", "2026-10-28"]);
});

test("nothing before the start date", () => {
  const dates = expand(
    { freq: "daily", start: "2026-10-05" },
    { from: "2026-10-01", to: "2026-10-06" },
  );

  expect(dates).toEqual(["2026-10-05", "2026-10-06"]);
});
