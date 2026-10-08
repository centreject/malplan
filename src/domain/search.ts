import { addDays, type IsoDate } from "./date";
import type { Item } from "./item";
import { expand } from "./recurrence";

export type SearchResult = { item: Item; date: IsoDate | undefined };

/** How far ahead a recurring item's next occurrence is looked for. */
const LOOKAHEAD_DAYS = 400;

/**
 * Items whose title, place or note contain the query. Upcoming results come first (soonest
 * first), then past ones (latest first), then undated. `all` returns every item (for tests/lists).
 */
export function searchItems(items: Item[], query: string, today: IsoDate, all = false): SearchResult[] {
  const needle = query.trim().toLowerCase();

  if (needle === "" && !all) {
    return [];
  }

  const hits = items.filter((item) =>
    [item.title, item.place ?? "", item.note ?? ""].some((text) => text.toLowerCase().includes(needle)),
  );

  return hits
    .map((item) => ({ item, date: nearestDate(item, today) }))
    .toSorted((a, b) => {
      const byRank = rank(a.date, today) - rank(b.date, today);
      const byDate = (a.date ?? "").localeCompare(b.date ?? "");

      return byRank !== 0 ? byRank : rank(a.date, today) === 1 ? -byDate : byDate;
    });
}

function nearestDate(item: Item, today: IsoDate): IsoDate | undefined {
  switch (item.when.kind) {
    case "single":
      return item.when.date;
    case "range":
      return item.when.end < today ? item.when.end : item.when.start < today ? today : item.when.start;
    case "recurring":
      return expand(item.when.rule, { from: today, to: addDays(today, LOOKAHEAD_DAYS) })[0] ?? item.when.rule.until ?? item.when.rule.start;
    case "none":
      return undefined;
  }
}

/** 0 = upcoming (soonest first), 1 = past (latest first), 2 = undated. */
function rank(date: IsoDate | undefined, today: IsoDate): number {
  if (date === undefined) {
    return 2;
  }

  return date >= today ? 0 : 1;
}
