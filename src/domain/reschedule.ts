import { addDays, dayNumber, weekdayOf, type IsoDate } from "./date";
import type { Item } from "./item";
import { missedDates } from "./schedule";

export type QuickTargets = { today: IsoDate; tomorrow: IsoDate; weekend: IsoDate; nextMonday: IsoDate };

/** Dates behind the overdue list's one-click buttons. */
export function quickTargets(today: IsoDate): QuickTargets {
  const weekday = weekdayOf(today);

  return {
    today,
    tomorrow: addDays(today, 1),
    // Saturday ahead; on Saturday or Sunday the weekend is already here.
    weekend: weekday === 0 ? today : addDays(today, 6 - weekday),
    nextMonday: addDays(today, ((8 - weekday) % 7) || 7),
  };
}

/**
 * Move the selected overdue tasks to `target`.
 * Single dates move; ranges keep their length and end on the target. A recurring task keeps its
 * series: the missed occurrences become skipped dates and one single-date copy lands on the target.
 */
export function reschedule(
  items: Item[],
  ids: string[],
  target: IsoDate,
  today: IsoDate,
  newId: () => string,
): Item[] {
  return items.flatMap((item): Item[] => {
    if (!ids.includes(item.id)) {
      return [item];
    }

    const when = item.when;

    switch (when.kind) {
      case "single":
        return [{ ...item, when: { kind: "single", date: target } }];

      case "range": {
        const length = dayNumber(when.end) - dayNumber(when.start);

        return [{ ...item, when: { kind: "range", start: addDays(target, -length), end: target } }];
      }

      case "recurring": {
        const except = [...new Set([...(when.rule.except ?? []), ...missedDates(item, today)])].toSorted();

        return [
          { ...item, when: { kind: "recurring", rule: { ...when.rule, except } } },
          { ...item, id: newId(), when: { kind: "single", date: target } },
        ];
      }

      case "none":
        return [item];
    }
  });
}
