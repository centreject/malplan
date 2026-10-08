// Korean public holidays, computed offline (SPEC §8). The API supplement only adds.
import * as v from "valibot";
import { addDays, makeDate, weekdayOf, type IsoDate } from "./date";

const FIRST_LUNAR_YEAR = 2020;

// One row per lunar year from FIRST_LUNAR_YEAR: "MMDD L bits".
// MMDD = solar date of lunar 1/1, L = leap month in hex (0 = none),
// bits = month lengths in order (leap month right after month L), 1 = 30 days, 0 = 29.
// Generated from ICU's Korean (dangi) calendar; holidays.test.ts checks it day by day
// against ICU and against officially published holidays.
const LUNAR_YEARS = [
  "0125 4 1011010010101", // 2020
  "0212 0 011010101010", // 2021
  "0201 0 101011010101", // 2022
  "0122 2 0101010110101", // 2023
  "0210 0 010010110110", // 2024
  "0129 6 1010010101110", // 2025
  "0217 0 101001010111", // 2026
  "0207 0 010100100111", // 2027
  "0127 5 0110100100110", // 2028
  "0213 0 110110010011", // 2029
  "0203 0 010110101010", // 2030
  "0123 3 1010101101010", // 2031
  "0211 0 100101101101", // 2032
  "0131 b 0100101011101", // 2033
  "0219 0 010010101110", // 2034
  "0208 0 101001001101", // 2035
  "0128 6 1101001001101", // 2036
  "0215 0 110100100101", // 2037
  "0204 0 110101010010", // 2038
  "0124 5 1101101010100", // 2039
  "0212 0 101101101010", // 2040
  "0201 0 100101101101", // 2041
  "0122 2 0100101011011", // 2042
  "0210 0 010010011011", // 2043
  "0130 7 1010010010111", // 2044
  "0217 0 101001001011", // 2045
  "0206 0 101100100101", // 2046
  "0126 5 1011010100101", // 2047
  "0214 0 011011010100", // 2048
  "0202 0 101011011010", // 2049
  "0123 3 1001010110110", // 2050
];

export function lunarToSolar(year: number, month: number, day: number, leap: boolean): IsoDate {
  const row = LUNAR_YEARS[year - FIRST_LUNAR_YEAR];

  if (row === undefined) {
    throw new RangeError(`No lunar table for ${year}`);
  }

  const [newYear = "", leapHex = "", bits = ""] = row.split(" ");
  const leapMonth = Number.parseInt(leapHex, 16);

  if (leap && month !== leapMonth) {
    throw new RangeError(`${year} has no leap month ${month}`);
  }

  const index = leap || (leapMonth > 0 && month > leapMonth) ? month : month - 1;
  const length = bits[index] === "1" ? 30 : 29;

  if (index >= bits.length || day < 1 || day > length) {
    throw new RangeError(`No lunar date ${year}/${month}/${day}`);
  }

  let offset = day - 1;

  for (let i = 0; i < index; i++) {
    offset += bits[i] === "1" ? 30 : 29;
  }

  return addDays(makeDate(year, Number(newYear.slice(0, 2)), Number(newYear.slice(2))), offset);
}

/** When a holiday earns a 대체공휴일. */
type SubstituteRule = "none" | "sunday-or-overlap" | "weekend-or-overlap" | "weekend";

function isWeekend(date: IsoDate): boolean {
  const weekday = weekdayOf(date);

  return weekday === 0 || weekday === 6;
}

function triggers(rule: SubstituteRule, date: IsoDate, overlap: boolean): boolean {
  switch (rule) {
    case "none": return false;
    case "sunday-or-overlap": return weekdayOf(date) === 0 || overlap;
    case "weekend-or-overlap": return isWeekend(date) || overlap;
    case "weekend": return isWeekend(date);
  }
}

// Weekend substitutes were extended to these holidays on the given dates.
function national(date: IsoDate): SubstituteRule {
  return date >= "2021-08-04" ? "weekend" : "none";
}

function religious(date: IsoDate): SubstituteRule {
  return date >= "2023-05-04" ? "weekend" : "none";
}

export function koreanHolidays(year: number): Map<IsoDate, string> {
  const solar = (month: number, day: number) => makeDate(year, month, day);
  const seollal = lunarToSolar(year, 1, 1, false);
  const buddha = lunarToSolar(year, 4, 8, false);
  const chuseok = lunarToSolar(year, 8, 15, false);

  const list: [IsoDate, string, SubstituteRule][] = [
    [solar(1, 1), "신정", "none"],
    [addDays(seollal, -1), "설날", "sunday-or-overlap"],
    [seollal, "설날", "sunday-or-overlap"],
    [addDays(seollal, 1), "설날", "sunday-or-overlap"],
    [solar(3, 1), "삼일절", national(solar(3, 1))],
    [solar(5, 5), "어린이날", "weekend-or-overlap"],
    [buddha, "부처님오신날", religious(buddha)],
    [solar(6, 6), "현충일", "none"],
    [solar(8, 15), "광복절", national(solar(8, 15))],
    [addDays(chuseok, -1), "추석", "sunday-or-overlap"],
    [chuseok, "추석", "sunday-or-overlap"],
    [addDays(chuseok, 1), "추석", "sunday-or-overlap"],
    [solar(10, 3), "개천절", national(solar(10, 3))],
    [solar(10, 9), "한글날", national(solar(10, 9))],
    [solar(12, 25), "성탄절", religious(solar(12, 25))],
  ];

  const holidays = new Map<IsoDate, string>();

  for (const [date, name] of list) {
    const existing = holidays.get(date);

    holidays.set(date, existing === undefined ? name : `${existing}, ${name}`);
  }

  for (const [date, name, rule] of list.toSorted((a, b) => a[0].localeCompare(b[0]))) {
    const overlap = list.some(([other, otherName]) => other === date && otherName !== name);

    if (!triggers(rule, date, overlap)) {
      continue;
    }

    let substitute = addDays(date, 1);

    while (isWeekend(substitute) || holidays.has(substitute)) {
      substitute = addDays(substitute, 1);
    }

    holidays.set(substitute, "대체공휴일");
  }

  return holidays;
}

// 한국천문연구원 특일정보 getRestDeInfo (공공데이터포털), JSON response.
const SpecialDay = v.object({
  dateName: v.string(),
  isHoliday: v.picklist(["Y", "N"]),
  locdate: v.pipe(
    v.number(),
    v.integer(),
    v.transform(String),
    v.regex(/^\d{8}$/),
    v.transform((s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`),
    v.isoDate(),
  ),
});

const RestDeResponse = v.object({
  response: v.object({
    body: v.object({
      items: v.union([v.literal(""), v.object({ item: v.union([SpecialDay, v.array(SpecialDay)]) })]),
    }),
  }),
});

/** Parses a getRestDeInfo response body; throws on anything unexpected. */
export function parseSpecialDays(body: string): Map<IsoDate, string> {
  const { items } = v.parse(RestDeResponse, JSON.parse(body)).response.body;
  const holidays = new Map<IsoDate, string>();

  if (items === "") {
    return holidays;
  }

  for (const day of [items.item].flat()) {
    if (day.isHoliday === "Y") {
      holidays.set(day.locdate, day.dateName);
    }
  }

  return holidays;
}

/** The supplement only adds dates; computed holidays always win. */
export function mergeHolidays(
  computed: Map<IsoDate, string>,
  supplement: Map<IsoDate, string>,
): Map<IsoDate, string> {
  return new Map([...supplement, ...computed]);
}

/** Holidays for several years; years outside the lunar table are skipped, not thrown. */
export function holidaysForYears(years: number[]): Map<IsoDate, string> {
  return new Map(
    years.flatMap((year) => {
      try {
        return [...koreanHolidays(year)];
      } catch (error) {
        if (error instanceof RangeError) {
          return [];
        }

        throw error;
      }
    }),
  );
}
