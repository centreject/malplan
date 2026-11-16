import { addDays, daysInMonth, makeDate, weekdayOf, type IsoDate, type Weekday } from "./date";
import type { Item, ItemTime } from "./item";
import { expand, type Recurrence } from "./recurrence";
import type { ClockTime, Slot } from "../parse/parseKorean";

export type Occurrence = { item: Item; date: IsoDate; done: boolean };

export type NextUp = { occurrence: Occurrence; minutesUntil: number };

/** `missed`: every unfinished occurrence date, oldest first; `latest` is the last of them. */
export type OverdueTask = { item: Item; latest: IsoDate; missed: IsoDate[] };

/** Where a time-of-day slot sits on the day's timeline. */
export const SLOT_START: Record<Slot, ClockTime> = {
  morning: { hour: 8, minute: 0 },
  lunch: { hour: 12, minute: 0 },
  dinner: { hour: 18, minute: 0 },
  night: { hour: 21, minute: 0 },
};

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

/**
 * What a completion is stored under in `done`: the item's date, the last day for a range task (one task, done
 * once, however many days it shows on), "done" for an undated one, the occurrence for a repeating one. A repeating
 * task without an occurrence date has no key: there is nothing to tick. The one rule for every screen and MCP.
 */
export function doneKey(item: Item, date: IsoDate | undefined): string | undefined {
  switch (item.when.kind) {
    case "single":
      return item.when.date;
    case "range":
      return item.when.end;
    case "none":
      return "done";
    case "recurring":
      return date;
  }
}

/** Whether the task is done on `date` (its occurrence; ignored unless it repeats). Events are never done. */
export function isDone(item: Item, date: IsoDate | undefined): boolean {
  const key = doneKey(item, date);

  return item.kind === "task" && key !== undefined && item.done.includes(key);
}

/**
 * Items on `date`, untimed first, then by start time. Remembered per items array and date: the board passes the
 * same array until something changes, and the three panes ask for some fifty days on every render. The result is
 * shared, so callers must not mutate it.
 */
export function occurrencesOn(items: Item[], date: IsoDate): Occurrence[] {
  let byDate = dayCache.get(items);

  if (byDate === undefined) {
    byDate = new Map();
    dayCache.set(items, byDate);
  }

  const known = byDate.get(date);

  if (known !== undefined) {
    return known;
  }

  const found = computeOccurrences(items, date);

  byDate.set(date, found);

  return found;
}

const dayCache = new WeakMap<Item[], Map<IsoDate, Occurrence[]>>();

function computeOccurrences(items: Item[], date: IsoDate): Occurrence[] {
  return items
    // Only tasks can be done: an event keeps no check, even one left from when it was a task.
    .flatMap((item) => (occursOn(item, date) ? [{ item, date, done: isDone(item, date) }] : []))
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

/** Next not-done timed item today from now. Later days are not pulled into the today pane. */
export function nextUp(items: Item[], today: IsoDate, nowMinutes: number): NextUp | undefined {
  for (const occurrence of occurrencesOn(items, today)) {
    const start = sortKey(occurrence.item.time);

    if (!occurrence.done && start >= nowMinutes) {
      return { occurrence, minutesUntil: start - nowMinutes };
    }
  }

  return undefined;
}

/** Unfinished task occurrences before `today`, one entry per item. */
export function overdueTasks(items: Item[], today: IsoDate): OverdueTask[] {
  return items.flatMap((item) => {
    const missed = missedDates(item, today);
    const latest = missed.at(-1);

    return latest === undefined ? [] : [{ item, latest, missed }];
  });
}

/** Unfinished occurrence dates of a task before `today`, however old: a task stays overdue until it is done. */
export function missedDates(item: Item, today: IsoDate): IsoDate[] {
  if (item.kind !== "task") {
    return [];
  }

  const known = missedCache.get(item);

  if (known?.today === today) {
    return known.missed;
  }

  const missed = datesBefore(item, addDays(today, -1)).filter((date) => !isDone(item, date));

  missedCache.set(item, { today, missed });

  return missed;
}

/**
 * Items are never mutated (an edit makes a new object), so the answer for an item object holds until the day
 * changes. Without this every check-off or edit walked every repeating task's whole series again.
 */
const missedCache = new WeakMap<Item, { today: IsoDate; missed: IsoDate[] }>();

function datesBefore(item: Item, last: IsoDate): IsoDate[] {
  switch (item.when.kind) {
    case "single":
      return item.when.date <= last ? [item.when.date] : [];
    case "range":
      // A range task is overdue once its last day has passed.
      return item.when.end <= last ? [item.when.end] : [];
    case "recurring":
      // ponytail: walks the whole series day by day, once per item object (missedCache); index if the first walk ever shows.
      return expand(item.when.rule, { from: item.when.rule.start, to: last });
    case "none":
      return [];
  }
}

/**
 * First occurrence of `rule` from `from` on, at most `days` ahead, that passes `accept`.
 * Expands a month at a time, so a near occurrence ends the search early.
 */
export function firstOccurrence(
  rule: Recurrence,
  from: IsoDate,
  days: number,
  accept: (date: IsoDate) => boolean = () => true,
): IsoDate | undefined {
  const end = addDays(from, days);

  for (let start = from; start <= end; start = addDays(start, 32)) {
    const to = addDays(start, 31);
    const found = expand(rule, { from: start, to: to < end ? to : end }).find(accept);

    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
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
