import { describe, expect, test } from "vitest";
import { addDays, makeDate, type IsoDate } from "./date";
import { holidaysForYears, koreanHolidays, lunarToSolar, mergeHolidays, parseSpecialDays } from "./holidays";

function namesOn(year: number, dates: IsoDate[]): (string | undefined)[] {
  const holidays = koreanHolidays(year);

  return dates.map((date) => holidays.get(date));
}

describe("lunarToSolar", () => {
  test("converts lunar new year and leap months", () => {
    expect(lunarToSolar(2024, 1, 1, false)).toBe("2024-02-10");
    expect(lunarToSolar(2023, 2, 1, true)).toBe("2023-03-22");
    expect(lunarToSolar(2023, 3, 1, false)).toBe("2023-04-20");
    expect(lunarToSolar(2025, 6, 1, true)).toBe("2025-07-25");
    expect(lunarToSolar(2025, 7, 1, false)).toBe("2025-08-23");
    expect(lunarToSolar(2020, 4, 1, true)).toBe("2020-05-23");
  });

  test("rejects years outside the table and missing leap months", () => {
    expect(() => lunarToSolar(2019, 1, 1, false)).toThrow(RangeError);
    expect(() => lunarToSolar(2051, 1, 1, false)).toThrow(RangeError);
    expect(() => lunarToSolar(2024, 3, 1, true)).toThrow(RangeError);
  });

  // Independent check of the embedded table: ICU's Korean (dangi) calendar.
  test("agrees with the ICU dangi calendar for every day 2020–2050", () => {
    const format = new Intl.DateTimeFormat("en-u-ca-dangi", {
      timeZone: "UTC", year: "numeric", month: "numeric", day: "numeric",
    });

    const mismatches: string[] = [];

    for (let year = 2020; year <= 2050; year++) {
      let date = lunarToSolar(year, 1, 1, false);
      const end = year === 2050 ? "2050-12-31" : lunarToSolar(year + 1, 1, 1, false);

      while (date < end) {
        const parts = format.formatToParts(new Date(`${date}T00:00:00Z`));
        const month = parts.find((p) => p.type === "month")?.value ?? "";
        const day = Number(parts.find((p) => p.type === "day")?.value);
        const leap = month.endsWith("bis");
        const lunarMonth = Number.parseInt(month, 10);

        if (lunarToSolar(year, lunarMonth, day, leap) !== date) {
          mismatches.push(`${date} = ${year}/${month}/${day}`);
        }

        date = addDays(date, 1);
      }
    }

    expect(mismatches).toEqual([]);
  });
});

describe("koreanHolidays — official published dates", () => {
  test("2024", () => {
    expect(namesOn(2024, ["2024-02-09", "2024-02-10", "2024-02-11"])).toEqual(["설날", "설날", "설날"]);
    expect(namesOn(2024, ["2024-02-12", "2024-05-06"])).toEqual(["대체공휴일", "대체공휴일"]);
    expect(namesOn(2024, ["2024-09-16", "2024-09-17", "2024-09-18"])).toEqual(["추석", "추석", "추석"]);
  });

  test("2025", () => {
    expect(namesOn(2025, ["2025-01-28", "2025-01-29", "2025-01-30"])).toEqual(["설날", "설날", "설날"]);
    expect(koreanHolidays(2025).get("2025-05-05")).toContain("부처님오신날");
    expect(koreanHolidays(2025).get("2025-05-05")).toContain("어린이날");
    expect(namesOn(2025, ["2025-03-03", "2025-05-06"])).toEqual(["대체공휴일", "대체공휴일"]);
    expect(namesOn(2025, ["2025-10-05", "2025-10-06", "2025-10-07"])).toEqual(["추석", "추석", "추석"]);
    expect(koreanHolidays(2025).get("2025-10-08")).toBe("대체공휴일");
  });

  test("2026: the complete computed list", () => {
    expect([...koreanHolidays(2026)].toSorted()).toEqual([
      ["2026-01-01", "신정"],
      ["2026-02-16", "설날"],
      ["2026-02-17", "설날"],
      ["2026-02-18", "설날"],
      ["2026-03-01", "삼일절"],
      ["2026-03-02", "대체공휴일"],
      ["2026-05-05", "어린이날"],
      ["2026-05-24", "부처님오신날"],
      ["2026-05-25", "대체공휴일"],
      ["2026-06-06", "현충일"],
      ["2026-08-15", "광복절"],
      ["2026-08-17", "대체공휴일"],
      ["2026-09-24", "추석"],
      ["2026-09-25", "추석"],
      ["2026-09-26", "추석"],
      ["2026-10-03", "개천절"],
      ["2026-10-05", "대체공휴일"],
      ["2026-10-09", "한글날"],
      ["2026-12-25", "성탄절"],
    ]);
  });

  test("2027", () => {
    expect(namesOn(2027, ["2027-02-06", "2027-02-07", "2027-02-08"])).toEqual(["설날", "설날", "설날"]);
    expect(koreanHolidays(2027).get("2027-02-09")).toBe("대체공휴일");
    expect(namesOn(2027, ["2027-09-14", "2027-09-15", "2027-09-16"])).toEqual(["추석", "추석", "추석"]);
  });

  test("weekend substitutes start on the dates the law took effect", () => {
    // 개천절 2020-10-03 was a Saturday, before the 2021-08-04 extension.
    expect(koreanHolidays(2020).has("2020-10-05")).toBe(false);
    expect(koreanHolidays(2021).get("2021-08-16")).toBe("대체공휴일");
    expect(koreanHolidays(2022).get("2022-10-10")).toBe("대체공휴일");
    // 성탄절 2022-12-25 was a Sunday, before the 2023-05-04 extension.
    expect(koreanHolidays(2022).has("2022-12-26")).toBe(false);
    expect(koreanHolidays(2023).get("2023-05-29")).toBe("대체공휴일");
  });

  test("every year in the table computes", () => {
    for (let year = 2020; year <= 2050; year++) {
      expect(koreanHolidays(year).get(makeDate(year, 1, 1))).toBe("신정");
    }
  });
});

function item(locdate: number, dateName: string, isHoliday: string) {
  return { dateKind: "01", dateName, isHoliday, locdate, seq: 1 };
}

type SpecialDay = ReturnType<typeof item>;

function response(items: "" | { item: SpecialDay | SpecialDay[] }): string {
  return JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
      body: { items, numOfRows: 10, pageNo: 1, totalCount: 1 },
    },
  });
}

describe("parseSpecialDays", () => {
  test("reads an array of items, keeping only holidays", () => {
    const body = response({
      item: [item(20260603, "전국동시지방선거", "Y"), item(20260505, "어린이날", "Y"), item(20260715, "제헌절", "N")],
    });

    expect(parseSpecialDays(body)).toEqual(new Map([
      ["2026-06-03", "전국동시지방선거"],
      ["2026-05-05", "어린이날"],
    ]));
  });

  test("reads a single item object", () => {
    expect(parseSpecialDays(response({ item: item(20261005, "대체공휴일", "Y") })))
      .toEqual(new Map([["2026-10-05", "대체공휴일"]]));
  });

  test("reads an empty month", () => {
    expect(parseSpecialDays(response(""))).toEqual(new Map());
  });

  test("rejects malformed responses", () => {
    expect(() => parseSpecialDays(response({ item: item(2026105, "x", "Y") }))).toThrow();
    expect(() => parseSpecialDays(JSON.stringify({ response: {} }))).toThrow();
    expect(() => parseSpecialDays("not json")).toThrow();
  });
});

describe("mergeHolidays", () => {
  test("adds supplement entries and never replaces or removes computed ones", () => {
    const computed = new Map([["2026-10-03", "개천절"], ["2026-10-05", "대체공휴일"]]);
    const supplement = new Map([["2026-06-03", "전국동시지방선거"], ["2026-10-03", "다른 이름"]]);

    expect(mergeHolidays(computed, supplement)).toEqual(new Map([
      ["2026-06-03", "전국동시지방선거"],
      ["2026-10-03", "개천절"],
      ["2026-10-05", "대체공휴일"],
    ]));
  });
});

test("holidaysForYears merges years and skips years outside the lunar table", () => {
  const holidays = holidaysForYears([2026, 2027, 2099]);

  expect(holidays.get("2026-10-05")).toBe("대체공휴일");
  expect(holidays.get("2027-01-01")).toBe("신정");
  expect([...holidays.keys()].some((date) => date.startsWith("2099"))).toBe(false);
});
