import { dayNumber, daysInMonth, fromDayNumber, partsOf, type DateParts, type IsoDate, type Weekday } from "./date";

type RuleBase = {
  start: IsoDate;
  /** Inclusive. Omitted = repeats forever. */
  until?: IsoDate;
  /** Every N days/weeks/months/years. Default 1. */
  interval?: number;
  /** Individually skipped occurrences. */
  except?: IsoDate[];
};

export type Recurrence = RuleBase &
  (
    | { freq: "daily" }
    | { freq: "weekly"; weekdays: Weekday[] }
    /** Day past the month's end falls back to the last day. */
    | { freq: "monthly"; day: number }
    /** nth = 1..4, or -1 for the last one. */
    | { freq: "monthly"; nth: number; weekday: Weekday }
    | { freq: "yearly"; month: number; day: number }
  );

export type DateRange = { from: IsoDate; to: IsoDate };

/** All occurrence dates of `rule` inside `range` (inclusive), ascending. */
export function expand(rule: Recurrence, range: DateRange): IsoDate[] {
  const first = rule.start > range.from ? rule.start : range.from;
  const last = rule.until !== undefined && rule.until < range.to ? rule.until : range.to;
  const except = new Set(rule.except ?? []);
  const day0 = dayNumber(rule.start);
  const start: Start = { ...partsOf(rule.start), day0, week: weekStart(day0) };
  const dates: IsoDate[] = [];

  // Walks day numbers, not date strings: a string per day (parsed and formatted again) made a long series slow.
  for (let n = dayNumber(first), end = dayNumber(last); n <= end; n++) {
    if (matches(rule, start, n)) {
      const date = fromDayNumber(n);

      if (!except.has(date)) dates.push(date);
    }
  }

  return dates;
}

const MS_PER_DAY = 86_400_000;

/** 0 = Sunday … 6 = Saturday, of day number `n` (1970-01-01 was a Thursday). */
const weekdayOfDay = (n: number) => (((n + 4) % 7) + 7) % 7;

/** Day number of the Sunday starting the week containing day `n`. */
const weekStart = (n: number) => n - weekdayOfDay(n);

/** The rule's start, worked out once per expand. */
type Start = DateParts & { day0: number; week: number };

function matches(rule: Recurrence, start: Start, n: number): boolean {
  const interval = rule.interval ?? 1;
  const date = new Date(n * MS_PER_DAY);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const weekday = weekdayOfDay(n);
  const monthsApart = (year - start.year) * 12 + (month - start.month);

  switch (rule.freq) {
    case "daily":
      return (n - start.day0) % interval === 0;

    case "weekly": {
      const weeksApart = (weekStart(n) - start.week) / 7;

      return rule.weekdays.some((w) => w === weekday) && weeksApart % interval === 0;
    }

    case "monthly": {
      if (monthsApart % interval !== 0) {
        return false;
      }

      const lastDay = daysInMonth(year, month);

      if ("day" in rule) {
        return day === Math.min(rule.day, lastDay);
      }

      if (weekday !== rule.weekday) {
        return false;
      }

      return rule.nth === -1 ? day + 7 > lastDay : Math.ceil(day / 7) === rule.nth;
    }

    case "yearly":
      return (
        (year - start.year) % interval === 0 &&
        month === rule.month &&
        day === Math.min(rule.day, daysInMonth(year, month))
      );
  }
}
