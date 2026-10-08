// Editing or deleting one occurrence of a recurring item: this one only, this and following, or all.
import { addDays, type IsoDate } from "./date";
import type { Item } from "./item";
import type { Recurrence } from "./recurrence";

export type SeriesScope = "this" | "future" | "all";

/** Apply `edited` (the dialog's version of `original`) to the occurrence on `date`. */
export function editOccurrence(
  items: Item[],
  original: Item,
  edited: Item,
  date: IsoDate,
  scope: SeriesScope,
  newId: () => string,
): Item[] {
  const rule = recurrenceOf(original);

  if (rule === undefined || scope === "all" || (scope === "future" && date <= rule.start)) {
    return items.map((item) => (item.id === original.id ? edited : item));
  }

  if (scope === "this") {
    const single: Item = {
      ...edited,
      id: newId(),
      // Keep a date the user changed; otherwise the occurrence becomes a one-off on its own date.
      when: edited.when.kind === "recurring" ? { kind: "single", date } : edited.when,
      done: original.done.filter((d) => d === date),
    };

    return items.flatMap((item) => (item.id === original.id ? [skip(original, rule, date), single] : [item]));
  }

  const head = endBefore(original, rule, date);

  const tail: Item = {
    ...edited,
    id: newId(),
    when: edited.when.kind === "recurring" ? { kind: "recurring", rule: { ...edited.when.rule, start: date } } : edited.when,
    done: original.done.filter((d) => d >= date),
  };

  return items.flatMap((item) => (item.id === original.id ? [head, tail] : [item]));
}

export function deleteOccurrence(items: Item[], original: Item, date: IsoDate, scope: SeriesScope): Item[] {
  const rule = recurrenceOf(original);

  if (rule === undefined || scope === "all" || (scope === "future" && date <= rule.start)) {
    return items.filter((item) => item.id !== original.id);
  }

  const replacement = scope === "this" ? skip(original, rule, date) : endBefore(original, rule, date);

  return items.map((item) => (item.id === original.id ? replacement : item));
}

function recurrenceOf(item: Item): Recurrence | undefined {
  return item.when.kind === "recurring" ? item.when.rule : undefined;
}

function skip(item: Item, rule: Recurrence, date: IsoDate): Item {
  const except = [...new Set([...(rule.except ?? []), date])].toSorted();

  return { ...item, when: { kind: "recurring", rule: { ...rule, except } } };
}

function endBefore(item: Item, rule: Recurrence, date: IsoDate): Item {
  return {
    ...item,
    when: { kind: "recurring", rule: { ...rule, until: addDays(date, -1) } },
    done: item.done.filter((d) => d < date),
  };
}
