import { addDays, daysInMonth, makeDate, weekdayOf, type IsoDate, type Weekday } from "./date";
import type { Item, ItemTime } from "./item";
import { expand } from "./recurrence";
import type { ClockTime, Slot } from "../parse/parseKorean";

export type Occurrence = { item: Item; date: IsoDate; done: boolean };

export type NextUp = { occurrence: Occurrence; minutesUntil: number };

export type OverdueTask = { item: Item; latest: IsoDate; missed: number };

/** Where a time-of-day slot sits on the day's timeline. */
export const SLOT_START: Record<Slot, ClockTime> = {
  morning: { hour: 8, minute: 0 },
  lunch: { hour: 12, minute: 0 },
  dinner: { hour: 18, minute: 0 },
  night: { hour: 21, minute: 0 },
};

const OVERDUE_LOOKBACK_DAYS = 60;

export function occursOn(item: Item, date: IsoDate): boolean {
  switch (item.when.kind) {
    case "single":
      return item.when.date === date;
    case "range":
      return item.when.start <= date && date <= item.when.end;
    case "recurring":
      return expand(item.when.rule, { from: date, to: date }).length > 0;
    case "none":
      return false;
  }
}

/** Items on `date`, untimed first, then by start time. */
export function occurrencesOn(items: Item[], date: IsoDate): Occurrence[] {
  return items
    .flatMap((item) => (occursOn(item, date) ? [{ item, date, done: item.done.includes(date) }] : []))
    .toSorted((a, b) => sortKey(a.item.time) - sortKey(b.item.time));
}

/** Minutes after midnight used for ordering; untimed items sort first. */
export function sortKey(time: ItemTime): number {
  switch (time.kind) {
    case "undecided":
      return -2;
    case "anytime":
      return -1;
    case "slot":
      return minutesOf(SLOT_START[time.slot]);
    case "exact":
      return minutesOf(time.start);
  }
}

export function minutesOf(clock: ClockTime): number {
  return clock.hour * 60 + clock.minute;
}

const NEXT_UP_LOOKAHEAD_DAYS = 7;

/** Next not-done timed item from now, looking up to a week ahead. */
export function nextUp(items: Item[], today: IsoDate, nowMinutes: number): NextUp | undefined {
  for (let offset = 0; offset <= NEXT_UP_LOOKAHEAD_DAYS; offset++) {
    const from = offset === 0 ? nowMinutes : 0;

    for (const occurrence of occurrencesOn(items, addDays(today, offset))) {
      const start = sortKey(occurrence.item.time);

      if (!occurrence.done && start >= from) {
        return { occurrence, minutesUntil: offset * 24 * 60 + start - nowMinutes };
      }
    }
  }

  return undefined;
}

/** Unfinished task occurrences before `today`, one entry per item. */
export function overdueTasks(items: Item[], today: IsoDate): OverdueTask[] {
  return items.flatMap((item) => {
    const missed = missedDates(item, today);
    const latest = missed.at(-1);

    return latest === undefined ? [] : [{ item, latest, missed: missed.length }];
  });
}

/** Unfinished occurrence dates of a task before `today` (within the lookback window). */
export function missedDates(item: Item, today: IsoDate): IsoDate[] {
  if (item.kind !== "task") {
    return [];
  }

  return datesBetween(item, addDays(today, -OVERDUE_LOOKBACK_DAYS), addDays(today, -1))
    .filter((date) => !item.done.includes(date));
}

function datesBetween(item: Item, from: IsoDate, to: IsoDate): IsoDate[] {
  switch (item.when.kind) {
    case "single":
      return from <= item.when.date && item.when.date <= to ? [item.when.date] : [];
    case "range":
      // A range task is overdue once its last day has passed.
      return from <= item.when.end && item.when.end <= to ? [item.when.end] : [];
    case "recurring":
      return expand(item.when.rule, { from, to });
    case "none":
      return [];
  }
}

/** The week pane's rolling window: 3 days before `center`, the day itself, 3 days after. */
export function daysAround(center: IsoDate): IsoDate[] {
  return Array.from({ length: 7 }, (_, index) => addDays(center, index - 3));
}

export function weekDates(anchor: IsoDate, weekStart: Weekday): IsoDate[] {
  const first = addDays(anchor, -((weekdayOf(anchor) - weekStart + 7) % 7));

  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

/** Whole weeks covering the month. */
export function monthCells(year: number, month: number, weekStart: Weekday): IsoDate[] {
  const first = weekDates(makeDate(year, month, 1), weekStart)[0] ?? makeDate(year, month, 1);
  const lastWeek = weekDates(makeDate(year, month, daysInMonth(year, month)), weekStart);
  const last = lastWeek[6] ?? first;
  const cells: IsoDate[] = [];

  for (let date = first; date <= last; date = addDays(date, 1)) {
    cells.push(date);
  }

  return cells;
}

export function formatClock(clock: ClockTime): string {
  return clock.minute === 0
    ? `${clock.hour}시`
    : `${clock.hour}:${String(clock.minute).padStart(2, "0")}`;
}
