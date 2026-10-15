// Rule-based extraction of dates, recurrence and times from Korean text.
// Title, category, place and notes are left to the LLM; this module only
// handles what must be computed exactly.
import { addDays, addMonths, dayNumber, daysInMonth, makeDate, partsOf, weekdayOf, type IsoDate, type Weekday } from "../domain/date";
import { lunarToSolar } from "../domain/holidays";
import type { Recurrence } from "../domain/recurrence";
import { normalizeNumbers } from "./koreanNumbers";

export type Slot = "morning" | "lunch" | "dinner" | "night";

export type ClockTime = { hour: number; minute: number };

export type ParsedDate =
  | { kind: "single"; date: IsoDate }
  | { kind: "range"; start: IsoDate; end: IsoDate }
  | { kind: "recurring"; rule: Recurrence };

export type ParsedTime =
  | { kind: "exact"; start: ClockTime; end?: ClockTime }
  | { kind: "slot"; slot: Slot };

/** Guesses the confirm screen should mark as "추정". */
export type Flag = "rolledToNextYear" | "assumedPm";

export type ParseResult = {
  date?: ParsedDate;
  time?: ParsedTime;
  flags: Flag[];
  /** Input with the extracted date/time phrases removed. */
  rest: string;
};

const WEEKDAY_BY_CHAR = new Map<string, Weekday>([
  ["일", 0], ["월", 1], ["화", 2], ["수", 3], ["목", 4], ["금", 5], ["토", 6],
]);

const NTH_BY_WORD = new Map([["첫", 1], ["둘", 2], ["셋", 3], ["넷", 4]]);

const SLOT_BY_WORD = new Map<string, Slot>([
  ["아침", "morning"], ["점심", "lunch"], ["저녁", "dinner"], ["밤", "night"],
]);

const WEEKDAY_TOKEN = "[일월화수목금토](?:요일)?(?=[,\\s·]|$)";

/** Mutable cursor over the text: each successful match is cut out of `rest`. */
class Scanner {
  rest: string;

  constructor(text: string) {
    this.rest = text;
  }

  /** Cuts the first match out of `rest`; a match `accept` rejects stays in the text. */
  take(pattern: RegExp, accept: (match: RegExpExecArray) => boolean = () => true): RegExpExecArray | undefined {
    const match = pattern.exec(this.rest);

    if (match === null || !accept(match)) {
      return undefined;
    }

    this.rest = `${this.rest.slice(0, match.index)} ${this.rest.slice(match.index + match[0].length)}`;

    return match;
  }
}

export function parseKorean(text: string, today: IsoDate): ParseResult {
  const scanner = new Scanner(normalizeNumbers(text));
  const flags: Flag[] = [];
  let date = takeRecurrence(scanner, today) ?? takeDate(scanner, today, flags);
  const time = takeTime(scanner, flags);

  // 밤 12시 / 자정 is 0:00 at the start of the next day.
  if (time?.kind === "exact" && time.start.hour === 24) {
    time.start = { hour: 0, minute: time.start.minute };

    if (date?.kind === "single") {
      date = { kind: "single", date: addDays(date.date, 1) };
    }
  }

  const rest = scanner.rest
    .replace(/(^|\s)(에|에는|부터|까지)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const result: ParseResult = { flags, rest };

  if (date !== undefined) {
    result.date = date;
  }

  if (time !== undefined) {
    result.time = time;
  }

  return result;
}

/** A date or a clock time in the text. Meal words alone ("저녁 약속") do not count: they are often just nouns. */
export function hasDateOrTime(text: string, today: IsoDate): boolean {
  const parsed = parseKorean(text, today);

  return parsed.date !== undefined || parsed.time?.kind === "exact";
}

function takeRecurrence(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const rule = takeRule(scanner, today);

  if (rule === undefined) {
    return undefined;
  }

  const until = scanner.take(/(\d{1,2})월\s*(\d{1,2})일\s*까지/, (m) => validMonthDay(m[1], m[2]));

  if (until !== undefined) {
    rule.until = upcoming(Number(until[1]), Number(until[2]), today).date;
  }

  return { kind: "recurring", rule };
}

function takeRule(scanner: Scanner, today: IsoDate): Recurrence | undefined {
  const start = today;

  if (scanner.take(/매일/) !== undefined) {
    return { freq: "daily", start };
  }

  const everyDays = scanner.take(/(\d{1,2})일\s*마다/);

  if (everyDays !== undefined) {
    return { freq: "daily", interval: Number(everyDays[1]), start };
  }

  const everyMonths = scanner.take(/(\d{1,2})개월\s*(?:마다|에\s*한\s*번)(?:\s*(\d{1,2})일)?/);

  if (everyMonths !== undefined) {
    const day = everyMonths[2] === undefined ? partsOf(today).day : Number(everyMonths[2]);

    return { freq: "monthly", day, interval: Number(everyMonths[1]), start };
  }

  const lastWeekday = scanner.take(/매(?:월|달)\s*마지막\s*(?:주\s*)?([일월화수목금토])요일/);
  const lastWeekdayValue = WEEKDAY_BY_CHAR.get(lastWeekday?.[1] ?? "");

  if (lastWeekdayValue !== undefined) {
    return { freq: "monthly", nth: -1, weekday: lastWeekdayValue, start };
  }

  const nthWeekday = scanner.take(/매(?:월|달)\s*(첫|둘|셋|넷)째\s*(?:주\s*)?([일월화수목금토])요일/);
  const nth = NTH_BY_WORD.get(nthWeekday?.[1] ?? "");
  const nthWeekdayValue = WEEKDAY_BY_CHAR.get(nthWeekday?.[2] ?? "");

  if (nth !== undefined && nthWeekdayValue !== undefined) {
    return { freq: "monthly", nth, weekday: nthWeekdayValue, start };
  }

  const monthlyDay = scanner.take(/매(?:월|달)\s*(\d{1,2})일/, (m) => validMonthDay("1", m[1]));

  if (monthlyDay !== undefined) {
    return { freq: "monthly", day: Number(monthlyDay[1]), start };
  }

  const yearly = scanner.take(/매년\s*(\d{1,2})월\s*(\d{1,2})일/, (m) => validMonthDay(m[1], m[2]));

  if (yearly !== undefined) {
    return { freq: "yearly", month: Number(yearly[1]), day: Number(yearly[2]), start };
  }

  const weekly = scanner.take(new RegExp(`(매주|격주|\\d{1,2}주\\s*마다)\\s*((?:${WEEKDAY_TOKEN}[,\\s·]*)+)`));

  if (weekly === undefined) {
    return undefined;
  }

  const weekdays = [...(weekly[2] ?? "").matchAll(new RegExp(WEEKDAY_TOKEN, "g"))]
    .flatMap((token) => {
      const weekday = WEEKDAY_BY_CHAR.get(token[0].charAt(0));

      return weekday === undefined ? [] : [weekday];
    });

  const rule: Recurrence = { freq: "weekly", weekdays, start };

  const everyWeeks = /^(\d{1,2})주/.exec(weekly[1] ?? "");

  if (weekly[1] === "격주") {
    rule.interval = 2;
  } else if (everyWeeks !== null) {
    rule.interval = Number(everyWeeks[1]);
  }

  return rule;
}

type DateRule = (scanner: Scanner, today: IsoDate, flags: Flag[]) => ParsedDate | undefined;

/** First rule that matches wins, so longer phrases come before the words inside them. */
function takeDate(scanner: Scanner, today: IsoDate, flags: Flag[]): ParsedDate | undefined {
  for (const rule of DATE_RULES) {
    const date = rule(scanner, today, flags);

    if (date !== undefined) {
      return date;
    }
  }

  return undefined;
}

/** A word ends here: end, space, punctuation, or a particle that itself ends. "내일신문", "오늘의집" do not. */
const WORD_END = "(?=$|[\\s,.!?~·)\\-]|(?:은|는|이|가|에|에는|에도|엔|까지|부터|도|로|의|쯤|중|안에|날)(?=$|[\\s,.!?~]))";

const RELATIVE_DAY = new Map([
  ["그그글피", 5], ["그글피", 4], ["글피", 3], ["내일모레", 2], ["모레", 2], ["명후일", 2], ["익익일", 2],
  ["내일", 1], ["명일", 1], ["익일", 1], ["오늘", 0], ["금일", 0],
  ["어제", -1], ["작일", -1], ["그저께", -2], ["그제", -2], ["그끄저께", -3], ["그그제", -3], ["그그그제", -4],
]);

// "낼" is left out: "보고서 낼 것" means "submit", not "tomorrow".
const YEAR_OFFSET = new Map([["올해", 0], ["금년", 0], ["내년", 1], ["명년", 1], ["내후년", 2], ["작년", -1], ["재작년", -2]]);

// Longest first, so "내일모레" is not read as "내일".
const RELATIVE_WORD = `(${[...RELATIVE_DAY.keys()].toSorted((a, b) => b.length - a.length).join("|")})`;

function relativeDay(word: string | undefined, today: IsoDate): IsoDate {
  return addDays(today, RELATIVE_DAY.get(word ?? "") ?? 0);
}

const WEEK_OFFSET = new Map([
  ["이번주", 0], ["금주", 0], ["오는주", 0], ["다음주", 1], ["차주", 1], ["내주", 1], ["익주", 1],
  ["다다음주", 2], ["다음다음주", 2], ["저번주", -1], ["지난주", -1], ["지지난주", -2], ["저저번주", -2], ["전전주", -2],
]);

const WEEK_PREFIX = "(이번|금|오는|다음|차|내|익|다다음|다음다음|저번|지난|지지난|저저번|전전)";

/** Weeks start on Monday, as Korean calendars and "다음주" usually mean. */
function mondayOf(date: IsoDate, weeksAhead: number): IsoDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7) + weeksAhead * 7);
}

function weekOffset(prefix: string | undefined): number {
  return WEEK_OFFSET.get(`${prefix ?? "이번"}주`) ?? 0;
}

const NTH = "(첫|둘|두|셋|세|넷|네|다섯|마지막)\\s*(?:째|번\\s*째)?";

const NTH_VALUE = new Map([["첫", 1], ["둘", 2], ["두", 2], ["셋", 3], ["세", 3], ["넷", 4], ["네", 4], ["다섯", 5], ["마지막", -1]]);

const MONTH_OFFSET = new Map([
  ["이번달", 0], ["이달", 0], ["당월", 0], ["다음달", 1], ["다음월", 1], ["익월", 1],
  ["다다음달", 2], ["다음다음달", 2], ["저번달", -1], ["지난달", -1], ["지지난달", -2],
]);

const MONTH_PREFIX = "(이번\\s*달|이달|당월|다음\\s*달|다음\\s*월|익월|다다음\\s*달|다음다음\\s*달|저번\\s*달|지난\\s*달|지지난\\s*달)";

const DATE_RULES: DateRule[] = [
  takeWritten,
  takeOffset,
  takeRelativeRange,
  takeMonthDayRange,
  takeDayRange,
  takeHoliday,
  takeMonthDay,
  takeMonthPart,
  takeRelativeWord,
  takeWeekPart,
  takeWeekday,
  takeWholeWeek,
  takeDayOfMonth,
];

/** 2026-10-01, 2026.10.1, 2026/10/01, 20261101, 25.07.15, 10/1. */
function takeWritten(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const full = scanner.take(
    /(?<![\d./-])(\d{4})\s?[-./]\s?(\d{1,2})\s?[-./]\s?(\d{1,2})\.?(?![\d/-])|(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/,
    (m) => validYearMonthDay(m[1] ?? m[4], m[2] ?? m[5], m[3] ?? m[6]),
  );

  if (full !== undefined) {
    return { kind: "single", date: makeDate(Number(full[1] ?? full[4]), Number(full[2] ?? full[5]), Number(full[3] ?? full[6])) };
  }

  const short = scanner.take(/(?<![\d.])(\d{2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/, (m) => validYearMonthDay(`20${m[1] ?? ""}`, m[2], m[3]));

  if (short !== undefined) {
    return { kind: "single", date: makeDate(2000 + Number(short[1]), Number(short[2]), Number(short[3])) };
  }

  const slash = scanner.take(new RegExp(`(?<![\\d/])(\\d{1,2})/(\\d{1,2})(?![\\d/])${WORD_END}`), (m) => validMonthDay(m[1], m[2]));

  return slash === undefined ? undefined : { kind: "single", date: upcoming(Number(slash[1]), Number(slash[2]), today).date };
}

function validYearMonthDay(yearText: string | undefined, monthText: string | undefined, dayText: string | undefined): boolean {
  return validMonthDay(monthText, dayText) && Number(dayText) <= daysInMonth(Number(yearText), Number(monthText));
}

/** 3일 뒤, 2주 3일 후, 1년 2개월 뒤, 하루 전 (number words were turned into digits first). */
function takeOffset(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  // "하루 전날" is "the day before", not an offset from today.
  const match = scanner.take(/(?:(?:오늘|지금)\s*(?:으로|로)?\s*부터\s*)?((?:\d{1,3}\s*(?:년|개월|달|주|일)\s*)+)(뒤|후|전|있다가)(?:(?![가-힣])|(?=에|까지|부터|쯤|엔))/);

  if (match === undefined) {
    return undefined;
  }

  const sign = match[2] === "전" ? -1 : 1;
  let months = 0;
  let days = 0;

  for (const [, count = "0", unit = ""] of (match[1] ?? "").matchAll(/(\d{1,3})\s*(년|개월|달|주|일)/g)) {
    const n = Number(count);

    months += unit === "년" ? n * 12 : unit === "개월" || unit === "달" ? n : 0;
    days += unit === "주" ? n * 7 : unit === "일" ? n : 0;
  }

  return { kind: "single", date: addDays(addMonths(today, sign * months), sign * days) };
}

/** 내일부터 모레까지. */
function takeRelativeRange(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(new RegExp(`(?<![가-힣])${RELATIVE_WORD}\\s*(?:부터|~|-)\\s*${RELATIVE_WORD}(?:\\s*까지)?`));

  return match === undefined ? undefined : { kind: "range", start: relativeDay(match[1], today), end: relativeDay(match[2], today) };
}

/** 10월 7일부터 9일까지, 10월 7일 ~ 10월 9일. */
function takeMonthDayRange(scanner: Scanner, today: IsoDate, flags: Flag[]): ParsedDate | undefined {
  const range = scanner.take(
    /(\d{1,2})월\s*(\d{1,2})일\s*(?:부터|~|-)\s*(?:(\d{1,2})월\s*)?(\d{1,2})일(?:\s*까지)?/,
    (m) => validMonthDay(m[1], m[2]) && validMonthDay(m[3] ?? m[1], m[4]),
  );

  if (range !== undefined) {
    const startMonth = Number(range[1]);
    const start = upcoming(startMonth, Number(range[2]), today);
    const endMonth = range[3] === undefined ? startMonth : Number(range[3]);
    const end = upcoming(endMonth, Number(range[4]), start.date);

    if (start.rolled) {
      flags.push("rolledToNextYear");
    }

    return { kind: "range", start: start.date, end: end.date };
  }

  return undefined;
}

/** 25일부터 3일까지: the end is the first such day on or after the start. */
function takeDayRange(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(/(?<![\d월])(\d{1,2})일\s*(?:부터|~|-)\s*(\d{1,2})일(?:\s*까지)?/, (m) => validMonthDay("1", m[1]) && validMonthDay("1", m[2]));

  if (match === undefined) {
    return undefined;
  }

  const start = upcomingDay(Number(match[1]), today);

  return { kind: "range", start, end: upcomingDay(Number(match[2]), start) };
}

/** Solar holidays by month/day; lunar ones (marked) by lunar month/day. */
const HOLIDAYS = new Map<string, [month: number, day: number, lunar: boolean]>([
  ["크리스마스이브", [12, 24, false]], ["크리스마스", [12, 25, false]], ["성탄절", [12, 25, false]], ["신정", [1, 1, false]],
  ["삼일절", [3, 1, false]], ["어린이날", [5, 5, false]], ["현충일", [6, 6, false]], ["제헌절", [7, 17, false]],
  ["광복절", [8, 15, false]], ["개천절", [10, 3, false]], ["한글날", [10, 9, false]],
  ["설날", [1, 1, true]], ["설", [1, 1, true]], ["구정", [1, 1, true]], ["추석", [8, 15, true]],
  ["부처님오신날", [4, 8, true]], ["석가탄신일", [4, 8, true]],
]);

/** Holiday names; "연휴" spans the day before to the day after. Bare "설" only with 연휴 ("설명" is not a holiday). */
function takeHoliday(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(
    new RegExp(`(?<![가-힣])(?:(크리스마스\\s*이브|크리스마스|성탄절|신정|삼일절|어린이날|현충일|제헌절|광복절|개천절|한글날|설날|구정|추석|부처님\\s*오신\\s*날|석가탄신일)|(설))(\\s*연휴)?${WORD_END}`),
    (m) => m[2] === undefined || m[3] !== undefined,
  );

  const holiday = HOLIDAYS.get((match?.[1] ?? match?.[2] ?? "").replace(/\s/g, ""));

  if (match === undefined || holiday === undefined) {
    return undefined;
  }

  const [month, day, lunar] = holiday;
  const holidayDays = match[3] === undefined ? 0 : 1;

  for (let year = partsOf(today).year; year <= partsOf(today).year + 1; year++) {
    const date = holidayIn(year, month, day, lunar);

    if (date !== undefined && dayNumber(addDays(date, holidayDays)) >= dayNumber(today)) {
      return holidayDays === 0 ? { kind: "single", date } : { kind: "range", start: addDays(date, -1), end: addDays(date, 1) };
    }
  }

  return undefined;
}

function holidayIn(year: number, month: number, day: number, lunar: boolean): IsoDate | undefined {
  if (!lunar) {
    return makeDate(year, month, day);
  }

  try {
    return lunarToSolar(year, month, day, false);
  } catch {
    // Outside the lunar table: no date rather than a wrong one.
    return undefined;
  }
}

function takeMonthDay(scanner: Scanner, today: IsoDate, flags: Flag[]): ParsedDate | undefined {
  const yearOf = (m: RegExpExecArray) => (m[1] === undefined ? m[2] === undefined ? undefined : partsOf(today).year + (YEAR_OFFSET.get(m[2]) ?? 0) : Number(m[1]));

  const monthDay = scanner.take(
    /(?:(\d{4})년\s*|(올해|금년|내년|명년|내후년|작년|재작년)\s*)?(\d{1,2})월\s*(\d{1,2})일/,
    (m) => {
      const year = yearOf(m);

      return validMonthDay(m[3], m[4]) && (year === undefined || Number(m[4]) <= daysInMonth(year, Number(m[3])));
    },
  );

  if (monthDay !== undefined) {
    const month = Number(monthDay[3]);
    const day = Number(monthDay[4]);
    const year = yearOf(monthDay);

    if (year !== undefined) {
      return { kind: "single", date: makeDate(year, month, day) };
    }

    const resolved = upcoming(month, day, today);

    if (resolved.rolled) {
      flags.push("rolledToNextYear");
    }

    return { kind: "single", date: resolved.date };
  }

  return undefined;
}

/**
 * Parts of a month: 다음달 15일, 이번 달 말일, 다음 달 첫날, 다음 달 셋째 토요일 (nth weekday),
 * 다음달 첫째주 금요일 (calendar row), 2월 말일, and bare 말일 / 둘째주 금요일 for this month.
 */
function takeMonthPart(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const pattern = new RegExp(
    `(?:${MONTH_PREFIX}|(?<![\\d가-힣]|[년해]\\s*)(\\d{1,2})월)?\\s*(?:의\\s*)?` +
      `(?:(\\d{1,2})일|(말일|마지막\\s*날)|(첫\\s*날)|${NTH}\\s*(주\\s*)?(?:의\\s*)?([일월화수목금토])요일|([일월화수목금토])요일)`,
  );

  let resolved: IsoDate | undefined;

  const match = scanner.take(pattern, (m) => {
    const [, prefix, explicit, day, last, first, nth, row, nthDay, bareDay] = m;
    const hasMonth = prefix !== undefined || explicit !== undefined;

    // Bare "15일" and bare weekdays belong to other rules; bare 말일 / 둘째주 금요일 count.
    if (!hasMonth && (day !== undefined || first !== undefined || bareDay !== undefined || (nth !== undefined && row === undefined))) {
      return false;
    }

    resolved = monthPart(today, prefix, explicit, { day, last, first, nth, row, weekday: nthDay ?? bareDay });

    return resolved !== undefined;
  });

  return match === undefined || resolved === undefined ? undefined : { kind: "single", date: resolved };
}

type MonthPartSpec = Partial<Record<"day" | "last" | "first" | "nth" | "row" | "weekday", string | undefined>>;

function monthPart(today: IsoDate, prefix: string | undefined, explicit: string | undefined, spec: MonthPartSpec): IsoDate | undefined {
  const { year, month } = partsOf(today);

  if (explicit !== undefined) {
    const target = Number(explicit);

    if (target < 1 || target > 12) {
      return undefined;
    }

    // An explicit month is the next one to come: 2월 말일 in October is next February's.
    const thisYear = dayIn(year, target, spec);

    return thisYear !== undefined && dayNumber(thisYear) >= dayNumber(today) ? thisYear : dayIn(year + 1, target, spec);
  }

  const offset = prefix === undefined ? 0 : MONTH_OFFSET.get(prefix.replace(/\s/g, "")) ?? 0;
  const first = addMonths(makeDate(year, month, 1), offset);
  const inMonth = dayIn(partsOf(first).year, partsOf(first).month, spec);

  // Bare 말일 / 둘째주 금요일: this month's, or next month's once it has passed.
  if (prefix === undefined && inMonth !== undefined && dayNumber(inMonth) < dayNumber(today)) {
    const next = addMonths(first, 1);

    return dayIn(partsOf(next).year, partsOf(next).month, spec);
  }

  return inMonth;
}

function dayIn(year: number, month: number, spec: MonthPartSpec): IsoDate | undefined {
  const length = daysInMonth(year, month);
  const weekday = WEEKDAY_BY_CHAR.get(spec.weekday ?? "");
  const nth = NTH_VALUE.get(spec.nth ?? "") ?? 1;

  if (spec.day !== undefined) {
    const day = Number(spec.day);

    return day >= 1 && day <= length ? makeDate(year, month, day) : undefined;
  }

  if (spec.last !== undefined) {
    return makeDate(year, month, length);
  }

  if (spec.first !== undefined) {
    return makeDate(year, month, 1);
  }

  if (weekday === undefined) {
    return undefined;
  }

  // Calendar rows start on Monday and may begin in the previous month, as on a wall calendar.
  if (spec.row !== undefined) {
    const rowMonday = mondayOf(makeDate(year, month, nth === -1 ? length : 1), nth === -1 ? 0 : nth - 1);

    return addDays(rowMonday, (weekday + 6) % 7);
  }

  const firstDay = makeDate(year, month, 1);
  const firstMatch = addDays(firstDay, (weekday - weekdayOf(firstDay) + 7) % 7);
  const lastDay = makeDate(year, month, length);
  const date = nth === -1 ? addDays(lastDay, -((weekdayOf(lastDay) - weekday + 7) % 7)) : addDays(firstMatch, (nth - 1) * 7);

  return partsOf(date).month === month ? date : undefined;
}

function takeRelativeWord(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(new RegExp(`(?<![가-힣])${RELATIVE_WORD}${WORD_END}`));

  return match === undefined ? undefined : { kind: "single", date: relativeDay(match[1], today) };
}

/** 이번 주말, 다음주 평일, 다음주초; bare 주말 / 주중 / 주초 mean the next one to come. */
function takeWeekPart(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(
    new RegExp(`(?<![가-힣])(?:${WEEK_PREFIX}\\s*주?\\s*)?주\\s*(말|중|초)${WORD_END}|(?<![가-힣])${WEEK_PREFIX}\\s*주\\s*(평일)${WORD_END}`),
  );

  if (match === undefined) {
    return undefined;
  }

  const prefix = match[1] ?? match[3];
  const part = match[2] ?? "중";
  const [from, to] = part === "말" ? [5, 6] : part === "초" ? [0, 1] : [0, 4];
  const monday = mondayOf(today, weekOffset(prefix));
  const passed = prefix === undefined && dayNumber(addDays(monday, to)) < dayNumber(today);
  const start = addDays(monday, from + (passed ? 7 : 0));

  return { kind: "range", start, end: addDays(start, to - from) };
}

/** 금요일, 다음주 화요일, 지난주 금요일, 차주 화요일, 목욜. */
function takeWeekday(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  // A bare weekday right after an unknown "…주" / "…째" ("그다음 주 토요일", "올해 다섯째 금요일") is not guessed.
  const match = scanner.take(new RegExp(`(?:(?<![가-힣])${WEEK_PREFIX}\\s*주\\s*|(?<![가-힣])(차|내|익)주\\s*|(?<![주째]\\s*))([일월화수목금토])(?:요일|욜)`));
  const weekday = WEEKDAY_BY_CHAR.get(match?.[3] ?? "");

  if (match === undefined || weekday === undefined) {
    return undefined;
  }

  const prefix = match[1] ?? match[2];

  if (prefix === undefined) {
    return { kind: "single", date: addDays(today, (weekday - weekdayOf(today) + 7) % 7) };
  }

  return { kind: "single", date: addDays(mondayOf(today, weekOffset(prefix)), (weekday + 6) % 7) };
}

/** 다음주, 이번 주에, 지난주: the whole Monday-Sunday week. "금주" alone is left out: it also means not drinking. */
function takeWholeWeek(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(new RegExp(`(?<![가-힣])(?:(이번|다음|다다음|다음다음|저번|지난|지지난|저저번)\\s*주|(내|익|전전)주)${WORD_END}`));

  if (match === undefined) {
    return undefined;
  }

  const monday = mondayOf(today, weekOffset(match[1] ?? match[2]));

  return { kind: "range", start: monday, end: addDays(monday, 6) };
}

/** Bare "15일": this month's, or the next month that has it. "3일간", "1일 1식", "30일 내로" are not dates. */
function takeDayOfMonth(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(
    new RegExp(`(?<![\\d./\\-]|[월달]\\s*)(\\d{1,2})일${WORD_END}(?!\\s*(?:\\d|동안|간|이내|내로|내에|연속|째|마다))`),
    (m) => validMonthDay("1", m[1]),
  );

  return match === undefined ? undefined : { kind: "single", date: upcomingDay(Number(match[1]), today) };
}

/** The first date on or after `from` whose day of month is `day`. */
function upcomingDay(day: number, from: IsoDate): IsoDate {
  const { year, month } = partsOf(from);

  for (let ahead = 0; ahead < 12; ahead++) {
    const first = addMonths(makeDate(year, month, 1), ahead);
    const { year: y, month: m } = partsOf(first);

    if (day <= daysInMonth(y, m) && dayNumber(makeDate(y, m, day)) >= dayNumber(from)) {
      return makeDate(y, m, day);
    }
  }

  return from;
}

type Upcoming = { date: IsoDate; rolled: boolean };

/** Month 1-12 and a day that month has in some year (2/29 counts). */
function validMonthDay(monthText: string | undefined, dayText: string | undefined): boolean {
  const month = Number(monthText);
  const day = Number(dayText);

  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(2028, month);
}

/** The first year from this one where month/day exists and has not passed (2/29 waits for a leap year). */
function upcoming(month: number, day: number, today: IsoDate): Upcoming {
  const { year } = partsOf(today);

  for (let next = year; next < year + 8; next++) {
    const date = makeDate(next, month, day);

    if (day <= daysInMonth(next, month) && dayNumber(date) >= dayNumber(today)) {
      return { date, rolled: next !== year };
    }
  }

  // Unreachable for validMonthDay input: a leap year comes within 8 years.
  return { date: makeDate(year + 1, month, day), rolled: true };
}

const MERIDIEM = "(오전|오후|새벽|아침|점심|저녁|밤)";

// "시(?!간)": "1시간" is a duration, not 1 o'clock.
const CLOCK = "(\\d{1,2})시(?!간)(?:\\s*(\\d{1,2})분|\\s*(반))?";

function takeTime(scanner: Scanner, flags: Flag[]): ParsedTime | undefined {
  const named = scanner.take(/(?<![가-힣])(정오|자정)/);

  if (named !== undefined) {
    return { kind: "exact", start: { hour: named[1] === "정오" ? 12 : 24, minute: 0 } };
  }

  const range = scanner.take(
    new RegExp(`(?:${MERIDIEM}\\s*)?${CLOCK}\\s*(?:부터|~|-)\\s*(?:${MERIDIEM}\\s*)?${CLOCK}(?:\\s*까지)?`),
    (m) => validClock(m[2], m[3]) && validClock(m[6], m[7]),
  );

  if (range !== undefined) {
    const start = toClock(range[1], range[2], range[3], range[4], flags);
    const endMeridiem = range[5] ?? (start.hour >= 12 ? "오후" : undefined);
    const end = toClock(endMeridiem, range[6], range[7], range[8], []);

    return { kind: "exact", start, end };
  }

  const single = scanner.take(new RegExp(`(?:${MERIDIEM}\\s*)?${CLOCK}`), (m) => validClock(m[2], m[3]));

  if (single !== undefined) {
    return { kind: "exact", start: toClock(single[1], single[2], single[3], single[4], flags) };
  }

  const colon = scanner.take(/(\d{1,2}):(\d{2})/, (m) => validClock(m[1], m[2]));

  if (colon !== undefined) {
    return { kind: "exact", start: { hour: Number(colon[1]), minute: Number(colon[2]) } };
  }

  const slotWord = scanner.take(/아침|점심|저녁|밤/);
  const slot = SLOT_BY_WORD.get(slotWord?.[0] ?? "");

  return slot === undefined ? undefined : { kind: "slot", slot };
}

/** Hour 0-24 and minute 0-59; "25시" is not a time. */
function validClock(hourText: string | undefined, minuteText: string | undefined): boolean {
  return Number(hourText) <= 24 && Number(minuteText ?? 0) <= 59;
}

function toClock(
  meridiem: string | undefined,
  hourText: string | undefined,
  minuteText: string | undefined,
  half: string | undefined,
  flags: Flag[],
): ClockTime {
  const minute = half === undefined ? Number(minuteText ?? 0) : 30;
  let hour = Number(hourText);

  if (meridiem === "밤" && hour === 12) {
    // 밤 12시: midnight, written 24 here and moved to the next day by parseKorean.
    hour = 24;
  } else if ((meridiem === "밤" && hour <= 5) || meridiem === "새벽" || meridiem === "오전") {
    // 밤 1시, 새벽 3시: small hours, not afternoon.
  } else if (hour < 12) {
    if (meridiem === "오후" || meridiem === "저녁" || meridiem === "밤") {
      hour += 12;
    } else if (meridiem === "점심" && hour <= 5) {
      hour += 12;
    } else if (meridiem === undefined && hour >= 1 && hour <= 6) {
      hour += 12;
      flags.push("assumedPm");
    }
  }

  return { hour, minute };
}
