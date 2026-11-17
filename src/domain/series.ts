// Editing or deleting one occurrence of a recurring item: this one only, this and following, or all.
import { addDays, type IsoDate } from "./date";
import type { Item } from "./item";
import type { Recurrence } from "./recurrence";
import { doneKey } from "./schedule";

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
    const single = carryDone({
      ...edited,
      id: newId(),
      // Keep a date the user changed; otherwise the occurrence becomes a one-off on its own date.
      when: edited.when.kind === "recurring" ? { kind: "single", date } : edited.when,
    }, original, date);

    return items.flatMap((item) => (item.id === original.id ? [skip(original, rule, date), single] : [item]));
  }

  const head = endBefore(original, rule, date);

  const tail: Item = edited.when.kind === "recurring"
    ? { ...edited, id: newId(), when: { kind: "recurring", rule: { ...edited.when.rule, start: date } }, done: original.done.filter((d) => d >= date) }
    : carryDone({ ...edited, id: newId() }, original, date);

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

/** A one-off made from the occurrence on `date`: done if that occurrence was, under its own key (it may have moved). */
function carryDone(item: Omit<Item, "done">, original: Item, date: IsoDate): Item {
  const key = doneKey({ ...item, done: [] }, undefined);

  return { ...item, done: original.done.includes(date) && key !== undefined ? [key] : [] };
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
