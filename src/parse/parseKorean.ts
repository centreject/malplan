// Rule-based extraction of dates, recurrence and times from Korean text.
// Title, category, place and notes are left to the LLM; this module only
// handles what must be computed exactly.
import { addDays, dayNumber, makeDate, partsOf, weekdayOf, type IsoDate, type Weekday } from "../domain/date";
import type { Recurrence } from "../domain/recurrence";

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

  take(pattern: RegExp): RegExpExecArray | undefined {
    const match = pattern.exec(this.rest);

    if (match === null) {
      return undefined;
    }

    this.rest = `${this.rest.slice(0, match.index)} ${this.rest.slice(match.index + match[0].length)}`;

    return match;
  }
}

export function parseKorean(text: string, today: IsoDate): ParseResult {
  const scanner = new Scanner(text);
  const flags: Flag[] = [];
  const date = takeRecurrence(scanner, today) ?? takeDate(scanner, today, flags);
  const time = takeTime(scanner, flags);

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

function takeRecurrence(scanner: Scanner, today: IsoDate): ParsedDate | undefined {
  const rule = takeRule(scanner, today);

  if (rule === undefined) {
    return undefined;
  }

  const until = scanner.take(/(\d{1,2})월\s*(\d{1,2})일\s*까지/);

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

  const monthlyDay = scanner.take(/매(?:월|달)\s*(\d{1,2})일/);

  if (monthlyDay !== undefined) {
    return { freq: "monthly", day: Number(monthlyDay[1]), start };
  }

  const yearly = scanner.take(/매년\s*(\d{1,2})월\s*(\d{1,2})일/);

  if (yearly !== undefined) {
    return { freq: "yearly", month: Number(yearly[1]), day: Number(yearly[2]), start };
  }

  const weekly = scanner.take(new RegExp(`(매주|격주)\\s*((?:${WEEKDAY_TOKEN}[,\\s·]*)+)`));

  if (weekly === undefined) {
    return undefined;
  }

  const weekdays = [...(weekly[2] ?? "").matchAll(new RegExp(WEEKDAY_TOKEN, "g"))]
    .flatMap((token) => {
      const weekday = WEEKDAY_BY_CHAR.get(token[0].charAt(0));

      return weekday === undefined ? [] : [weekday];
    });

  const rule: Recurrence = { freq: "weekly", weekdays, start };

  if (weekly[1] === "격주") {
    rule.interval = 2;
  }

  return rule;
}

function takeDate(scanner: Scanner, today: IsoDate, flags: Flag[]): ParsedDate | undefined {
  const range = scanner.take(/(\d{1,2})월\s*(\d{1,2})일\s*부터\s*(?:(\d{1,2})월\s*)?(\d{1,2})일\s*까지/);

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

  const monthDay = scanner.take(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);

  if (monthDay !== undefined) {
    const month = Number(monthDay[2]);
    const day = Number(monthDay[3]);

    if (monthDay[1] !== undefined) {
      return { kind: "single", date: makeDate(Number(monthDay[1]), month, day) };
    }

    const resolved = upcoming(month, day, today);

    if (resolved.rolled) {
      flags.push("rolledToNextYear");
    }

    return { kind: "single", date: resolved.date };
  }

  const relative = scanner.take(/오늘|내일|모레|글피/);
  const offset = new Map([["오늘", 0], ["내일", 1], ["모레", 2], ["글피", 3]]).get(relative?.[0] ?? "");

  if (offset !== undefined) {
    return { kind: "single", date: addDays(today, offset) };
  }

  const weekdayMatch = scanner.take(/(다다음\s*주|다음\s*주|이번\s*주)?\s*([일월화수목금토])요일/);
  const weekday = WEEKDAY_BY_CHAR.get(weekdayMatch?.[2] ?? "");

  if (weekday === undefined) {
    return undefined;
  }

  const week = (weekdayMatch?.[1] ?? "").replace(/\s/g, "");

  if (week === "") {
    return { kind: "single", date: addDays(today, (weekday - weekdayOf(today) + 7) % 7) };
  }

  const weeksAhead = new Map([["이번주", 0], ["다음주", 1], ["다다음주", 2]]).get(week) ?? 0;
  const sunday = addDays(today, -weekdayOf(today));

  return { kind: "single", date: addDays(sunday, weeksAhead * 7 + weekday) };
}

type Upcoming = { date: IsoDate; rolled: boolean };

/** This year's month/day, or next year's if it has already passed. */
function upcoming(month: number, day: number, today: IsoDate): Upcoming {
  const thisYear = makeDate(partsOf(today).year, month, day);

  if (dayNumber(thisYear) >= dayNumber(today)) {
    return { date: thisYear, rolled: false };
  }

  return { date: makeDate(partsOf(today).year + 1, month, day), rolled: true };
}

const MERIDIEM = "(오전|오후|새벽|아침|점심|저녁|밤)";

const CLOCK = "(\\d{1,2})시(?:\\s*(\\d{1,2})분|\\s*(반))?";

function takeTime(scanner: Scanner, flags: Flag[]): ParsedTime | undefined {
  const range = scanner.take(
    new RegExp(`(?:${MERIDIEM}\\s*)?${CLOCK}\\s*(?:부터|~|-)\\s*(?:${MERIDIEM}\\s*)?${CLOCK}(?:\\s*까지)?`),
  );

  if (range !== undefined) {
    const start = toClock(range[1], range[2], range[3], range[4], flags);
    const endMeridiem = range[5] ?? (start.hour >= 12 ? "오후" : undefined);
    const end = toClock(endMeridiem, range[6], range[7], range[8], []);

    return { kind: "exact", start, end };
  }

  const single = scanner.take(new RegExp(`(?:${MERIDIEM}\\s*)?${CLOCK}`));

  if (single !== undefined) {
    return { kind: "exact", start: toClock(single[1], single[2], single[3], single[4], flags) };
  }

  const colon = scanner.take(/(\d{1,2}):(\d{2})/);

  if (colon !== undefined) {
    return { kind: "exact", start: { hour: Number(colon[1]), minute: Number(colon[2]) } };
  }

  const slotWord = scanner.take(/아침|점심|저녁|밤/);
  const slot = SLOT_BY_WORD.get(slotWord?.[0] ?? "");

  return slot === undefined ? undefined : { kind: "slot", slot };
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

  if (hour < 12) {
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
