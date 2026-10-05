import {
  addDays,
  dayNumber,
  daysInMonth,
  partsOf,
  weekdayOf,
  type IsoDate,
  type Weekday,
} from "./date";

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
  const dates: IsoDate[] = [];

  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (matches(rule, date) && !(rule.except ?? []).includes(date)) {
      dates.push(date);
    }
  }

  return dates;
}

function matches(rule: Recurrence, date: IsoDate): boolean {
  const interval = rule.interval ?? 1;
  const start = partsOf(rule.start);
  const { year, month, day } = partsOf(date);
  const monthsApart = (year - start.year) * 12 + (month - start.month);

  switch (rule.freq) {
    case "daily":
      return (dayNumber(date) - dayNumber(rule.start)) % interval === 0;

    case "weekly": {
      const weeksApart = (weekStart(date) - weekStart(rule.start)) / 7;

      return rule.weekdays.includes(weekdayOf(date)) && weeksApart % interval === 0;
    }

    case "monthly": {
      if (monthsApart % interval !== 0) {
        return false;
      }

      const lastDay = daysInMonth(year, month);

      if ("day" in rule) {
        return day === Math.min(rule.day, lastDay);
      }

      if (weekdayOf(date) !== rule.weekday) {
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

/** Day number of the Sunday starting the week containing `date`. */
function weekStart(date: IsoDate): number {
  return dayNumber(date) - weekdayOf(date);
}
