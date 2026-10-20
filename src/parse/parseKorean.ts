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

/** Guesses the confirm screen should mark as "추정"; checkDate = date words left that the rules could not read. */
export type Flag = "rolledToNextYear" | "assumedPm" | "checkDate";

/** Date-like words still in the text after parsing: "그날", "마지막 영업일", "다섯째 주", "2월 30일". */
// Also a second day word ("내일 회의 모레 발표") or week word left over.
const UNREAD_DATE =
  /(?<![가-힣])(?:그날|전날|당일|이튿날|영업일|이맘때)|째\s*주|\d{1,2}\s*월\s*\d{1,2}\s*일|(?<![\d가-힣])\d{1,2}\s*일(?![가-힣])|[월화수목금토일]요일|(?<![가-힣])(?:오늘|내일|모레|글피|어제|그제)(?=$|[\s,.!?]|[은는이가에도의](?![가-힣]))|(?<![가-힣])(?:이번|다음|지난|저번)\s*주(?![가-힣])/;

/** A repeat word the recurrence rules could not read ("매달 말일", "매주 주말"): better no date than a one-off one. */
const UNREAD_REPEAT = /(?<![가-힣])매(?:주|달|월|년)(?![가-힣])|(?:일|주|달|월|년)\s*마다/;

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

  /** Where the last cut left its space, so a following phrase ("의 다음 날") can be matched right there. */
  private lastCut = -1;

  constructor(text: string) {
    this.rest = text;
  }

  /** Cuts the first match out of `rest`; a match `accept` rejects stays in the text. */
  take(pattern: RegExp, accept: (match: RegExpExecArray) => boolean = () => true): RegExpExecArray | undefined {
    const match = pattern.exec(this.rest);

    if (match === null || !accept(match)) {
      return undefined;
    }

    this.cut(match.index, match[0].length);

    return match;
  }

  /** Like take, but only directly after the last cut. */
  takeAfter(pattern: RegExp): RegExpExecArray | undefined {
    if (this.lastCut < 0) {
      return undefined;
    }

    const sticky = new RegExp(pattern.source, "y");

    sticky.lastIndex = this.lastCut;

    const match = sticky.exec(this.rest);

    if (match === null) {
      return undefined;
    }

    this.cut(match.index, match[0].length);

    return match;
  }

  cut(index: number, length: number): void {
    this.rest = `${this.rest.slice(0, index)} ${this.rest.slice(index + length)}`;
    this.lastCut = index;
  }
}

export function parseKorean(text: string, today: IsoDate): ParseResult {
  const scanner = new Scanner(normalizeNumbers(text));
  const flags: Flag[] = [];
  const recurrence = takeRecurrence(scanner, today);
  const unreadRepeat = recurrence === undefined && UNREAD_REPEAT.test(scanner.rest);
  let date = recurrence ?? (unreadRepeat ? undefined : takeDateRange(scanner, today, flags) ?? takeDate(scanner, today, flags));

  if (unreadRepeat) {
    flags.push("checkDate");
  }

  const time = takeTime(scanner, flags);

  // 밤 12시 / 자정 is 0:00 at the start of the next day.
  if (time?.kind === "exact" && time.start.hour === 24) {
    time.start = { hour: 0, minute: time.start.minute };

    if (date?.kind === "single") {
      date = { kind: "single", date: addDays(date.date, 1) };
    }
  }

  const rest = scanner.rest
    // Particles and suffixes left when a date/time was cut: "토요일엔", "금요일날", "3시쯤", "3시경".
    .replace(/(^|\s)(에|에는|에도|엔|날|쯤|경|부터|까지)(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (UNREAD_DATE.test(rest)) {
    flags.push("checkDate");
  }

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

  // 월요일마다, 일요일마다.
  const everyWeekday = scanner.take(/(?<![가-힣])([일월화수목금토])요일\s*마다/);
  const everyWeekdayValue = WEEKDAY_BY_CHAR.get(everyWeekday?.[1] ?? "");

  if (everyWeekdayValue !== undefined) {
    return { freq: "weekly", weekdays: [everyWeekdayValue], start };
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

    if (date === undefined) {
      continue;
    }

    if (date.kind !== "single") {
      return date;
    }

    const start = shiftedDate(scanner, date.date);
    // "10월 20일부터 3일간": a start and a length.
    const length = scanner.takeAfter(/\s*부터\s*(\d{1,3})\s*일\s*(?:간|동안)/);

    return length === undefined ? { kind: "single", date: start } : { kind: "range", start, end: addDays(start, Math.max(Number(length[1]) - 1, 0)) };
  }

  return undefined;
}

/** "크리스마스 전날", "다음 달 첫날 다음 날", "마지막 금요일에서 2일 뒤": a shift right after a date. */
function shiftedDate(scanner: Scanner, date: IsoDate): IsoDate {
  const neighbour = scanner.takeAfter(/\s*(?:의\s*)?(다음\s*날|이튿날|전날)(?![가-힣])/);

  if (neighbour !== undefined) {
    return shiftedDate(scanner, addDays(date, neighbour[1] === "전날" ? -1 : 1));
  }

  const offset = scanner.takeAfter(/\s*(?:에서|로부터)\s*(\d{1,3})\s*(일|주|개월|달)\s*(뒤|후|전)(?![가-힣])/);

  if (offset === undefined) {
    return date;
  }

  const sign = offset[3] === "전" ? -1 : 1;
  const n = sign * Number(offset[1]);

  return offset[2] === "일" ? addDays(date, n) : offset[2] === "주" ? addDays(date, n * 7) : addMonths(date, n);
}

/**
 * "A부터 B까지" with any two dates: 다음주 월요일부터 금요일까지, 내일부터 3일 뒤까지.
 * A time range ("3시부터 5시까지") is left alone.
 */
function takeDateRange(scanner: Scanner, today: IsoDate, flags: Flag[]): ParsedDate | undefined {
  const match = /^(.*?)\s*부터\s*(.+?)\s*까지/.exec(scanner.rest);

  if (match === null) {
    return undefined;
  }

  const left = new Scanner(match[1] ?? "");
  const right = new Scanner(match[2] ?? "");
  const startFlags: Flag[] = [];
  const start = takeDate(left, today, startFlags);
  // "3일 뒤까지" counts from the start; 모레, 금요일, 15일 count from today as usual.
  const base = start?.kind === "single" && /뒤|후/.test(match[2] ?? "") ? start.date : today;
  let end = start?.kind === "single" ? takeDate(right, base, []) : undefined;

  // "다음주 월요일부터 금요일까지": a bare end that falls before the start is the one after it.
  if (start?.kind === "single" && end?.kind === "single" && dayNumber(end.date) < dayNumber(start.date)) {
    right.rest = match[2] ?? "";
    end = takeDate(right, start.date, []);
  }

  if (start?.kind !== "single" || end?.kind !== "single" || right.rest.trim() !== "" || dayNumber(end.date) < dayNumber(start.date)) {
    return undefined;
  }

  flags.push(...startFlags);
  scanner.rest = `${left.rest} ${scanner.rest.slice(match[0].length)}`;

  return { kind: "range", start: start.date, end: end.date };
}

/** A word ends here: end, space, punctuation, or a particle that itself ends. "내일신문", "오늘의집" do not. */
// Time words may follow with no space: "오늘저녁", "내일아침 9시", "내일3시".
const WORD_END = "(?=$|[\\s\\d,.!?~·()\\-]|아침|점심|저녁|밤|새벽|오전|오후|낮|(?:은|는|이|가|에|에는|에도|엔|까지|부터|도|로|의|쯤|중|안에|날)(?=$|[\\s,.!?~]))";

const RELATIVE_DAY = new Map([
  ["그그글피", 5], ["그글피", 4], ["글피", 3], ["내일모레", 2], ["낼모레", 2], ["모레", 2], ["명후일", 2], ["익익일", 2],
  ["내일", 1], ["명일", 1], ["익일", 1], ["오늘", 0], ["금일", 0],
  ["어제", -1], ["작일", -1], ["그저께", -2], ["그제", -2], ["그끄저께", -3], ["그그제", -3], ["그그그제", -4],
]);

// "낼" is left out: "보고서 낼 것" means "submit", not "tomorrow".
const YEAR_OFFSET = new Map([
  ["올해", 0], ["금년", 0], ["내년", 1], ["명년", 1], ["다음해", 1], ["내후년", 2], ["작년", -1], ["지난해", -1], ["재작년", -2],
]);

const YEAR_WORD = "(올해|금년|내년|명년|다음\\s*해|내후년|작년|지난\\s*해|재작년)";

function yearOffset(word: string | undefined): number {
  return YEAR_OFFSET.get((word ?? "").replace(/\s/g, "")) ?? 0;
}

/** Two-digit years: up to 20 years ahead are this century ("25년" = 2025), the rest the last ("99" = 1999). */
function fullYear(text: string, today: IsoDate): number {
  const year = Number(text);

  if (text.length === 4) {
    return year;
  }

  return year <= (partsOf(today).year % 100) + 20 ? 2000 + year : 1900 + year;
}

// Longest first, so "내일모레" is not read as "내일".
const RELATIVE_WORD = `(${[...RELATIVE_DAY.keys()].toSorted((a, b) => b.length - a.length).join("|")})`;

function relativeDay(word: string | undefined, today: IsoDate): IsoDate {
  return addDays(today, RELATIVE_DAY.get(word ?? "") ?? 0);
}

const WEEK_OFFSET = new Map([
  ["이번주", 0], ["금주", 0], ["오는주", 0], ["다음주", 1], ["차주", 1], ["내주", 1], ["익주", 1],
  ["다다음주", 2], ["다음다음주", 2], ["저번주", -1], ["지난주", -1], ["지지난주", -2], ["저저번주", -2], ["전전주", -2],
  ["다다다음주", 3], ["다다담주", 3], ["저저저번주", -3], ["지지지난주", -3], ["전전전주", -3], ["담주", 1], ["다담주", 2],
]);

const WEEK_PREFIX = "(이번|금|오는|다음|담|다담|차|내|익|다다음|다음다음|다다다음|다다담|저번|지난|지지난|지지지난|저저번|저저저번|전전|전전전)";

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
  ["다다음달", 2], ["다음다음달", 2], ["저번달", -1], ["지난달", -1], ["지지난달", -2], ["저저번달", -2],
]);

const MONTH_PREFIX = "(이번\\s*달|이달|당월|다음\\s*달|다음\\s*월|익월|다다음\\s*달|다음다음\\s*달|저번\\s*달|지난\\s*달|지지난\\s*달|저저번\\s*달)";

const DATE_RULES: DateRule[] = [
  takeWritten,
  takeOffset,
  takeRelativeRange,
  takeMonthDayRange,
  takeDayRange,
  // An explicit date wins over a holiday name, which then stays in the title: "12월 25일 크리스마스 파티".
  takeMonthDay,
  takeHoliday,
  takeSameTime,
  takeYearPart,
  takeMonthPart,
  takeRelativeWord,
  takeWeekPart,
  takeWeekday,
  takeWholeWeek,
  takeDayOfMonth,
];

/** 2026-10-01, 2026.10.1, 2026/10/01, 20261101, 25.07.15, 10/1. */
function takeWritten(scanner: Scanner, today: IsoDate, flags: Flag[]): ParsedDate | undefined {
  const full = scanner.take(
    /(?<![\d./-])(\d{4})\s?[-./]\s?(\d{1,2})\s?[-./]\s?(\d{1,2})\.?(?![\d/-])|(?<!\d)(20\d{2})(\d{2})(\d{2})(?!\d)/,
    (m) => validYearMonthDay(m[1] ?? m[4], m[2] ?? m[5], m[3] ?? m[6]),
  );

  if (full !== undefined) {
    return { kind: "single", date: makeDate(Number(full[1] ?? full[4]), Number(full[2] ?? full[5]), Number(full[3] ?? full[6])) };
  }

  const short = scanner.take(/(?<![\d.])(\d{2})\.(\d{1,2})\.(\d{1,2})(?![\d.])/, (m) => validYearMonthDay(String(fullYear(m[1] ?? "", today)), m[2], m[3]));

  if (short !== undefined) {
    return { kind: "single", date: makeDate(fullYear(short[1] ?? "", today), Number(short[2]), Number(short[3])) };
  }

  const slash = scanner.take(new RegExp(`(?<![\\d/])(\\d{1,2})/(\\d{1,2})(?![\\d/])${WORD_END}`), (m) => validMonthDay(m[1], m[2]));

  if (slash === undefined) {
    return undefined;
  }

  const resolved = upcoming(Number(slash[1]), Number(slash[2]), today);

  // "1/2 진행상황" in October may be a fraction or a count, not next January.
  if (resolved.rolled) {
    flags.push("checkDate");
  }

  return { kind: "single", date: resolved.date };
}

function validYearMonthDay(yearText: string | undefined, monthText: string | undefined, dayText: string | undefined): boolean {
  return validMonthDay(monthText, dayText) && Number(dayText) <= daysInMonth(Number(yearText), Number(monthText));
}

/** 3일 뒤, 2주 3일 후, 1년 2개월 뒤, 하루 전 (number words were turned into digits first). */
function takeOffset(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  // "하루 전날" is "the day before", not an offset from today.
  // Not "10월 9일 전" (a date) nor "…에서 2일 뒤" (a shift of another date).
  // "N일 전" alone is not counted back from today: "회의 3일 전", "7일 전 알림" mean before some event.
  const match = scanner.take(
    /(?:((?:오늘|지금)\s*(?:으로|로)?\s*부터)\s*|(?<![\d월]\s*|(?:에서|로부터)\s*))((?:\d{1,3}\s*(?:년|개월|달|주|일)\s*)+)(뒤|후|전|있다가)(?:(?![가-힣])|(?=에|까지|부터|쯤|엔))/,
    (m) => m[3] !== "전" || m[1] !== undefined,
  );

  if (match === undefined) {
    return undefined;
  }

  const sign = match[3] === "전" ? -1 : 1;
  let months = 0;
  let days = 0;

  for (const [, count = "0", unit = ""] of (match[2] ?? "").matchAll(/(\d{1,3})\s*(년|개월|달|주|일)/g)) {
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
    // Not "10월 20일부터 3일간": that end is a length (see takeDate).
    /(\d{1,2})월\s*(\d{1,2})일\s*(?:부터|~|-)\s*(?:(\d{1,2})월\s*)?(\d{1,2})일(?!\s*(?:간|동안))(?:\s*까지)?/,
    (m) => validMonthDay(m[1], m[2]) && validMonthDay(m[3] ?? m[1], m[4]),
  );

  if (range !== undefined) {
    const start = upcoming(Number(range[1]), Number(range[2]), today);
    // A bare end day is the first such day after the start, not that day in the start's month a year on.
    const end = range[3] === undefined ? upcomingDay(Number(range[4]), start.date) : upcoming(Number(range[3]), Number(range[4]), start.date).date;

    if (start.rolled) {
      flags.push("rolledToNextYear");
    }

    return { kind: "range", start: start.date, end };
  }

  return undefined;
}

/** 25일부터 3일까지: the end is the first such day on or after the start. */
function takeDayRange(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(/(?<!\d|월\s*)(\d{1,2})일\s*(?:부터|~|-)\s*(\d{1,2})일(?!\s*(?:간|동안))(?:\s*까지)?/, (m) => validMonthDay("1", m[1]) && validMonthDay("1", m[2]));

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
  ["발렌타인데이", [2, 14, false]], ["밸런타인데이", [2, 14, false]], ["화이트데이", [3, 14, false]], ["근로자의날", [5, 1, false]],
  ["어버이날", [5, 8, false]], ["스승의날", [5, 15, false]], ["할로윈", [10, 31, false]], ["핼러윈", [10, 31, false]], ["빼빼로데이", [11, 11, false]],
]);

const HOLIDAY_NAME =
  "크리스마스\\s*이브|크리스마스|성탄절|신정|삼일절|어린이날|현충일|제헌절|광복절|개천절|한글날|설날|구정|추석|부처님\\s*오신\\s*날|석가탄신일|" +
  "발렌타인데이|밸런타인데이|화이트데이|근로자의\\s*날|어버이날|스승의\\s*날|할로윈|핼러윈|빼빼로데이";

/**
 * Holiday names; "연휴" spans the day before to the day after. Bare "설" only with 연휴 ("설명" is not a holiday).
 * A year word fixes the year ("올해 추석" even if it has passed); otherwise the next one to come.
 */
function takeHoliday(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(
    new RegExp(`(?<![가-힣])(?:(올해|올|금년|내년|명년|내후년|작년|재작년)\\s*)?(?:(${HOLIDAY_NAME})|(설))(\\s*연휴)?${WORD_END}(?!\\s*(?:선물|준비|용품|음식|장보기|특가|세일|할인))`),
    (m) => m[3] === undefined || m[4] !== undefined,
  );

  const holiday = HOLIDAYS.get((match?.[2] ?? match?.[3] ?? "").replace(/\s/g, ""));

  if (match === undefined || holiday === undefined) {
    return undefined;
  }

  const [month, day, lunar] = holiday;
  const holidayDays = match[4] === undefined ? 0 : 1;
  const yearWord = match[1] === "올" ? "올해" : match[1];
  const fixedYear = yearWord === undefined ? undefined : partsOf(today).year + (YEAR_OFFSET.get(yearWord) ?? 0);

  if (fixedYear !== undefined) {
    const date = holidayIn(fixedYear, month, day, lunar);

    return date === undefined ? undefined : holidayDays === 0 ? { kind: "single", date } : { kind: "range", start: addDays(date, -1), end: addDays(date, 1) };
  }

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
  const yearOf = (m: RegExpExecArray) => (m[1] === undefined ? m[2] === undefined ? undefined : partsOf(today).year + yearOffset(m[2]) : fullYear(m[1], today));

  const monthDay = scanner.take(
    // A weekday right after the date ("10월 25일 일요일", "25일(일)") belongs to it.
    /(?:(?<!\d)(\d{4}|\d{2})년\s*|(올해|금년|내년|명년|내후년|작년|재작년)\s*)?(\d{1,2})\s*월(?:달)?\s*(\d{1,2})\s*일(?:\s*\([일월화수목금토]\)|\s+[일월화수목금토]요일)?/,
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

/** 다음 주 이맘때, 지난달 이맘때, 내년 이맘때: the same day a week, month or year away. */
function takeSameTime(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(new RegExp(`(?<![가-힣])(?:${WEEK_PREFIX}\\s*주|${MONTH_PREFIX}|${YEAR_WORD})\\s*이맘때`));

  if (match === undefined) {
    return undefined;
  }

  const [, week, month, year] = match;

  if (week !== undefined) {
    return { kind: "single", date: addDays(today, weekOffset(week) * 7) };
  }

  const months = month === undefined ? yearOffset(year) * 12 : MONTH_OFFSET.get(month.replace(/\s/g, "")) ?? 0;

  return { kind: "single", date: addMonths(today, months) };
}

/** 내년 마지막 금요일, 올해 첫 월요일, 작년 마지막 날, 다음 해 첫날: January for "first", December for "last". */
function takeYearPart(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  let resolved: IsoDate | undefined;

  const match = scanner.take(
    new RegExp(`(?<![가-힣])${YEAR_WORD}\\s*(?:의\\s*)?(?:(첫\\s*날)|(마지막\\s*날)|${NTH}\\s*(주\\s*)?(?:의\\s*)?([일월화수목금토])요일)`),
    (m) => {
      const [, word, first, last, nth, row, weekday] = m;
      const fromEnd = last !== undefined || nth === "마지막";

      // Only first or last: "올해 다섯째 금요일" has no clear meaning.
      if (nth !== undefined && nth !== "첫" && nth !== "마지막") {
        return false;
      }

      resolved = dayIn(partsOf(today).year + yearOffset(word), fromEnd ? 12 : 1, { first, last, nth, row, weekday });

      return resolved !== undefined;
    },
  );

  return match === undefined || resolved === undefined ? undefined : { kind: "single", date: resolved };
}

/**
 * Parts of a month: 다음달 15일, 이번 달 말일, 다음 달 첫날, 다음 달 셋째 토요일 (nth weekday),
 * 다음달 첫째주 금요일 (calendar row), 2월 말일, and bare 말일 / 둘째주 금요일 for this month.
 */
function takeMonthPart(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const pattern = new RegExp(
    `(?:${MONTH_PREFIX}|(올해|금년|내년|명년|내후년|작년|재작년)\\s*(\\d{1,2})월|(?<![\\d가-힣]|[년해]\\s*)(\\d{1,2})월)?\\s*(?:의\\s*)?` +
      `(?:(\\d{1,2})일|(말일|마지막\\s*날)|(첫\\s*날)|${NTH}\\s*(주\\s*)?(?:의\\s*)?([일월화수목금토])요일|([일월화수목금토])요일)`,
  );

  let resolved: IsoDate | undefined;

  const match = scanner.take(pattern, (m) => {
    const [, prefix, yearWord, yearMonth, explicit, day, last, first, nth, row, nthDay, bareDay] = m;
    const hasMonth = prefix !== undefined || yearMonth !== undefined || explicit !== undefined;

    // Bare "15일" and bare weekdays belong to other rules; bare 말일 / 둘째주 금요일 count.
    // Bare "마지막 금요일" is this month's last Friday; bare "첫 월요일" is too vague to guess.
    if (!hasMonth && (day !== undefined || first !== undefined || bareDay !== undefined || (nth !== undefined && row === undefined && nth !== "마지막"))) {
      return false;
    }

    const spec = { day, last, first, nth, row, weekday: nthDay ?? bareDay };

    resolved = yearMonth === undefined
      ? monthPart(today, prefix, explicit, spec)
      : validMonthDay(yearMonth, "1") ? dayIn(partsOf(today).year + (YEAR_OFFSET.get(yearWord ?? "") ?? 0), Number(yearMonth), spec) : undefined;

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

  // "첫째 주 금요일" is read like "첫째 금요일" (the nth such weekday), as people use it for closing days and as
  // 매월 첫째 주 월요일 already does; calendar rows put dates in the neighbouring month.
  const firstDay = makeDate(year, month, 1);
  const firstMatch = addDays(firstDay, (weekday - weekdayOf(firstDay) + 7) % 7);
  const lastDay = makeDate(year, month, length);
  const date = nth === -1 ? addDays(lastDay, -((weekdayOf(lastDay) - weekday + 7) % 7)) : addDays(firstMatch, (nth - 1) * 7);

  return partsOf(date).month === month ? date : undefined;
}

/** With several day words, a coming day beats a past one: "어제 주문한 택배 오늘 도착" is about today. */
function takeRelativeWord(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const matches = [...scanner.rest.matchAll(new RegExp(`(?<![가-힣])${RELATIVE_WORD}${WORD_END}`, "g"))];
  const match = matches.find((m) => (RELATIVE_DAY.get(m[1] ?? "") ?? 0) >= 0) ?? matches[0];

  if (match === undefined) {
    return undefined;
  }

  scanner.cut(match.index, match[0].length);

  return { kind: "single", date: relativeDay(match[1], today) };
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
  const match = scanner.take(
    new RegExp(`(?:(?<![가-힣])${WEEK_PREFIX}\\s*주\\s*|(?<![가-힣])(차|내|익)주\\s*|(?<![가-힣])(지난|저번)\\s+|(?<![가-힣])(?:다음|다가오는|오는)\\s+|(?<![주째]\\s*))([일월화수목금토])(?:요일|욜)`),
  );

  const weekday = WEEKDAY_BY_CHAR.get(match?.[4] ?? "");

  if (match === undefined || weekday === undefined) {
    return undefined;
  }

  // 지난 금요일: the most recent one before today.
  if (match[3] !== undefined) {
    return { kind: "single", date: addDays(today, -((weekdayOf(today) - weekday + 6) % 7) - 1) };
  }

  const prefix = match[1] ?? match[2];

  if (prefix === undefined) {
    // Said on a Monday, "월요일" means next Monday; today would be "오늘".
    return { kind: "single", date: addDays(today, ((weekday - weekdayOf(today) + 6) % 7) + 1) };
  }

  const date = addDays(mondayOf(today, weekOffset(prefix)), (weekday + 6) % 7);

  // On a Sunday, "이번주 토요일" means the coming one, not yesterday.
  return { kind: "single", date: weekOffset(prefix) === 0 && dayNumber(date) < dayNumber(today) ? addDays(date, 7) : date };
}

/**
 * 다음주, 이번 주에, 지난주: the whole Monday-Sunday week. "다음주까지" is a deadline (its Sunday), "다음주부터" a start
 * (its Monday). "금주" alone is left out: it also means not drinking.
 */
function takeWholeWeek(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(
    new RegExp(`(?<![가-힣])(?:(이번|다음|다다음|다음다음|다다다음|다다담|저번|지난|지지난|지지지난|저저번|저저저번)\\s*주|(내|익|담|다담|전전|전전전)주)(까지|부터)?${WORD_END}`),
  );

  if (match === undefined) {
    return undefined;
  }

  const monday = mondayOf(today, weekOffset(match[1] ?? match[2]));

  if (match[3] !== undefined) {
    return { kind: "single", date: match[3] === "까지" ? addDays(monday, 6) : monday };
  }

  return { kind: "range", start: monday, end: addDays(monday, 6) };
}

/** Bare "15일": this month's, or the next month that has it. "3일간", "1일 1식", "30일 내로" are not dates. */
/** Words after "N일" that make it a length of time. */
const DURATION_NOUN = "동안|간|이내|내로|내에|연속|째|마다|전|후|뒤|챌린지|무료|체험|무이자|할부|격리|코스|과정|완성|프로그램|이용권|패스|단식|다이어트|분량|치";

function takeDayOfMonth(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const match = scanner.take(
    // "2박 3일", "30일 챌린지", "7일 무료체험" are lengths, not days of the month.
    new RegExp(`(?<![\\d./\\-]|[월달박]\\s*)(\\d{1,2})일(?:\\([일월화수목금토]\\))?${WORD_END}(?!\\s*(?:\\d+\\s*(?![시:분])[가-힣]|${DURATION_NOUN}))`),
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
// Digits glued to letters are model names, not hours: "S22 시리즈".
// 시 is a clock only when no other word starts there: not "1시간", "3시청", "10시방향", and with a space before
// 시 only when a clock word follows ("15 시리즈", "D-3 시험", "2 시즌" are not times).
const SI = "(?:시(?!간|청|험|즌|리즈|방향|대|절|계|작|장|조|점)|\\s+시(?=$|[\\s\\d,.!?~)\\-]|반|에|부터|까지|쯤|경|정각))";

const CLOCK = `(?<![A-Za-z\\d])(\\d{1,2})${SI}(?:\\s*(\\d{1,2})분|\\s*(반))?`;

/** The start of a range may drop 시: "3~5시". */
const RANGE_START = `(?<![A-Za-z\\d])(\\d{1,2})(?:${SI}(?:\\s*(\\d{1,2})분|\\s*(반))?)?`;

function takeTime(scanner: Scanner, flags: Flag[]): ParsedTime | undefined {
  const named = scanner.take(/(?<![가-힣])(정오|자정)/);

  if (named !== undefined) {
    return { kind: "exact", start: { hour: named[1] === "정오" ? 12 : 24, minute: 0 } };
  }

  // 17시 5분 전 = 16:55.
  const before = scanner.take(new RegExp(`(?:${MERIDIEM}\\s*)?(\\d{1,2})\\s*시\\s*(\\d{1,2})\\s*분\\s*전(?![가-힣])`), (m) => validClock(m[2], m[3]));

  if (before !== undefined) {
    const clock = toClock(before[1], before[2], undefined, undefined, flags);
    const minutes = clock.hour * 60 - Number(before[3]);

    return { kind: "exact", start: { hour: Math.floor(minutes / 60), minute: minutes % 60 } };
  }

  // PM 3:30, 3:30 pm, 3pm.
  const english = scanner.take(/(?:(AM|PM|am|pm)\s*)?(?<![\d:])(\d{1,2})(?::(\d{2}))?\s*(?:(AM|PM|am|pm)(?![a-zA-Z]))?/, (m) => {
    const marker = m[1] ?? m[4];

    return marker !== undefined && validClock(m[2], m[3]) && Number(m[2]) <= 12;
  });

  if (english !== undefined) {
    const pm = (english[1] ?? english[4] ?? "").toLowerCase() === "pm";
    const hour = Number(english[2]) % 12 + (pm ? 12 : 0);

    return { kind: "exact", start: { hour, minute: Number(english[3] ?? 0) } };
  }

  const range = scanner.take(
    new RegExp(`(?:${MERIDIEM}\\s*)?${RANGE_START}\\s*(?:부터|~|-)\\s*(?:${MERIDIEM}\\s*)?${CLOCK}(?:\\s*까지)?`),
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

  // 14:30, 오후 3:30, 14:00~16:00. Without 오전/오후 the hour is read as written (24-hour).
  const colon = scanner.take(
    new RegExp(`(?:${MERIDIEM}\\s*)?(\\d{1,2}):(\\d{2})(?:\\s*[~\\-]\\s*(\\d{1,2}):(\\d{2}))?`),
    (m) => validClock(m[2], m[3]) && (m[4] === undefined || validClock(m[4], m[5])),
  );

  if (colon !== undefined) {
    const clockAt = (hour: string | undefined, minute: string | undefined) =>
      colon[1] === undefined ? { hour: Number(hour), minute: Number(minute) } : toClock(colon[1], hour, minute, undefined, []);

    const start = clockAt(colon[2], colon[3]);

    return colon[4] === undefined ? { kind: "exact", start } : { kind: "exact", start, end: clockAt(colon[4], colon[5]) };
  }

  // Glued to a noun ("저녁약속", "점심모임") the word sets the slot but stays in the title. 밤 is left out: "밤샘".
  const glued = /(?<![가-힣])(아침|점심|저녁)(?=[가-힣])/.exec(scanner.rest);
  const gluedSlot = SLOT_BY_WORD.get(glued?.[1] ?? "");

  if (gluedSlot !== undefined) {
    return { kind: "slot", slot: gluedSlot };
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
