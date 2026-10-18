// Week numbering for the week pane: "10월 2주차". A week starts on a chosen weekday and belongs to the month
// its first day falls in (Monday weeks by default, as on Korean office calendars).
import { addDays, partsOf, weekdayOf, type IsoDate, type Weekday } from "./date";

export type WeekLabel = { month: number; nth: number };

export function weekStartOf(date: IsoDate, start: Weekday): IsoDate {
  return addDays(date, -((weekdayOf(date) - start + 7) % 7));
}

export function weekLabel(date: IsoDate, start: Weekday): WeekLabel {
  const { month, day } = partsOf(weekStartOf(date, start));

  return { month, nth: Math.floor((day - 1) / 7) + 1 };
}
