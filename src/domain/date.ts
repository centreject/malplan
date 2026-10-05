/** Calendar date without time zone, formatted "YYYY-MM-DD". */
export type IsoDate = string;

/** 0 = Sunday … 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const MS_PER_DAY = 86_400_000;

export type DateParts = { year: number; month: number; day: number };

export function partsOf(date: IsoDate): DateParts {
  const [year = NaN, month = NaN, day = NaN] = date.split("-").map(Number);

  return { year, month, day };
}

export function makeDate(year: number, month: number, day: number): IsoDate {
  return fromDayNumber(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/** Days since 1970-01-01. */
export function dayNumber(date: IsoDate): number {
  const { year, month, day } = partsOf(date);

  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

export function fromDayNumber(days: number): IsoDate {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDayNumber(dayNumber(date) + days);
}

export function weekdayOf(date: IsoDate): Weekday {
  // 1970-01-01 was a Thursday (4).
  const index = (((dayNumber(date) + 4) % 7) + 7) % 7;
  const weekdays = [0, 1, 2, 3, 4, 5, 6] as const;

  return weekdays[index] ?? 0;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}
