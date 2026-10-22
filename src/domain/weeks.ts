// Week numbering for the week pane: "10월 2주차". A week starts on a chosen weekday and belongs to the month
// its first day falls in (Monday weeks by default, as on Korean office calendars).
import { addDays, makeDate, partsOf, weekdayOf, type IsoDate, type Weekday } from "./date";

export type WeekLabel = { month: number; nth: number };

export function weekStartOf(date: IsoDate, start: Weekday): IsoDate {
  return addDays(date, -((weekdayOf(date) - start + 7) % 7));
}

export function weekLabel(date: IsoDate, start: Weekday): WeekLabel {
  const { month, day } = partsOf(weekStartOf(date, start));

  return { month, nth: Math.floor((day - 1) / 7) + 1 };
}

/** The first days of the weeks that belong to a month: "10월 1주차" … in order. */
export function weeksOfMonth(year: number, month: number, start: Weekday): IsoDate[] {
  const first = addDays(makeDate(year, month, 1), (start - weekdayOf(makeDate(year, month, 1)) + 7) % 7);

  return Array.from({ length: 5 }, (_, index) => addDays(first, index * 7)).filter((date) => partsOf(date).month === month);
}
