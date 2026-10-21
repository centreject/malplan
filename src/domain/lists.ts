// Data for the list page: every task by section, and recurring items grouped by the day they happen.
import type { IsoDate, Weekday } from "./date";
import { WEEKDAY_NAMES, recurrenceLabel } from "./format";
import type { Item } from "./item";
import type { Recurrence } from "./recurrence";
import { firstOccurrence, missedDates } from "./schedule";

export type RecurringEntry = { item: Item; rule: string; next: IsoDate | undefined };

export type RecurringGroup = { key: string; label: string; entries: RecurringEntry[] };

const LOOKAHEAD_DAYS = 800;

/**
 * Recurring items grouped by when they happen: daily, each weekday (an item on 월·수 shows in both),
 * day N of the month, nth weekday of the month, yearly date. `ended` lists finished series instead.
 */
export function groupRecurring(items: Item[], today: IsoDate, weekStart: Weekday, ended = false): RecurringGroup[] {
  const groups = new Map<string, RecurringGroup & { order: number }>();

  const add = (key: string, label: string, order: number, entry: RecurringEntry) => {
    const group = groups.get(key) ?? { key, label, order, entries: [] };

    group.entries.push(entry);
    groups.set(key, group);
  };

  for (const item of items) {
    if (item.when.kind !== "recurring") {
      continue;
    }

    const rule = item.when.rule;
    const finished = rule.until !== undefined && rule.until < today;

    if (finished !== ended) {
      continue;
    }

    const entry = { item, rule: recurrenceLabel(rule), next: nextOccurrence(rule, today) };

    for (const [key, label, order] of groupKeys(rule, weekStart)) {
      add(key, label, order, entry);
    }
  }

  return [...groups.values()]
    .toSorted((a, b) => a.order - b.order)
    .map(({ key, label, entries }) => ({ key, label, entries }));
}

/** [key, label, sort order] for each group an item belongs to. */
function groupKeys(rule: Recurrence, weekStart: Weekday): [string, string, number][] {
  switch (rule.freq) {
    case "daily":
      return [["daily", "매일·며칠마다", 0]];
    case "weekly":
      return rule.weekdays.map((d) => [`w${d}`, `${WEEKDAY_NAMES[d]}요일`, 100 + ((d - weekStart + 7) % 7)]);
    case "monthly":
      return "day" in rule
        ? [[`md${rule.day}`, `매월 ${rule.day}일`, 200 + rule.day]]
        : [[`mn${rule.nth}-${rule.weekday}`, `매월 ${rule.nth === -1 ? "마지막" : `${rule.nth}째`} ${WEEKDAY_NAMES[rule.weekday]}요일`, 300 + (rule.nth === -1 ? 9 : rule.nth) * 10 + rule.weekday]];
    case "yearly":
      return [[`y${rule.month}-${rule.day}`, `매년 ${rule.month}/${rule.day}`, 400 + rule.month * 40 + rule.day]];
  }
}

function nextOccurrence(rule: Recurrence, today: IsoDate): IsoDate | undefined {
  return firstOccurrence(rule, today, LOOKAHEAD_DAYS);
}

export type TaskEntry = { item: Item; date: IsoDate | undefined };

export type TaskSections = Record<"overdue" | "today" | "upcoming" | "undated" | "done", TaskEntry[]>;

function byDate(a: TaskEntry, b: TaskEntry): number {
  return (a.date ?? "").localeCompare(b.date ?? "");
}

/** Every task, sorted into the list page's sections. Events are left out. */
export function taskSections(items: Item[], today: IsoDate): TaskSections {
  const sections: TaskSections = { overdue: [], today: [], upcoming: [], undated: [], done: [] };

  for (const item of items) {
    if (item.kind !== "task") {
      continue;
    }

    if (item.when.kind === "none") {
      (item.done.includes("done") ? sections.done : sections.undated).push({ item, date: undefined });
      continue;
    }

    const missed = missedDates(item, today);

    if (missed.length > 0) {
      sections.overdue.push({ item, date: missed.at(-1) });
    }

    const next = upcomingDate(item, today);

    if (next === today) {
      sections.today.push({ item, date: next });
    } else if (next !== undefined) {
      sections.upcoming.push({ item, date: next });
    } else if (missed.length === 0) {
      sections.done.push({ item, date: lastDate(item) });
    }
  }

  return {
    overdue: sections.overdue.toSorted(byDate),
    today: sections.today,
    upcoming: sections.upcoming.toSorted(byDate),
    undated: sections.undated,
    done: sections.done.toSorted((a, b) => -byDate(a, b)),
  };
}

/** First not-done date from today on. */
function upcomingDate(item: Item, today: IsoDate): IsoDate | undefined {
  switch (item.when.kind) {
    case "single":
      return item.when.date >= today && !item.done.includes(item.when.date) ? item.when.date : undefined;
    case "range":
      return item.when.end >= today && !item.done.includes(item.when.end) ? (item.when.start > today ? item.when.start : today) : undefined;
    case "recurring":
      return firstOccurrence(item.when.rule, today, LOOKAHEAD_DAYS, (d) => !item.done.includes(d));
    case "none":
      return undefined;
  }
}

function lastDate(item: Item): IsoDate | undefined {
  switch (item.when.kind) {
    case "single":
      return item.when.date;
    case "range":
      return item.when.end;
    case "recurring":
      return item.when.rule.until;
    case "none":
      return undefined;
  }
}
