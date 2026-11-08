import { addDays, type IsoDate } from "./date";
import type { Item } from "./item";
import { SLOT_START, formatClock, minutesOf, occurrencesOn } from "./schedule";

export type Reminder = { key: string; title: string; body: string };

/** An item's `remindMinutes` meaning "no reminder"; leaving the field out means "the default lead". */
export const NO_REMINDER = -1;

const DAY = 24 * 60;

/** Morning summary of today's undecided items. */
const UNDECIDED_SUMMARY_AT = 8 * 60;

/**
 * Reminders whose fire time falls in (fromMinutes, toMinutes] of `today`.
 * Exact times fire `remindMinutes` (or the default) before the start, possibly on the day before;
 * slots fire when the slot starts; undecided items get one morning summary. The key identifies the
 * occurrence and its time, so the caller can avoid firing twice yet a moved item reminds again.
 * After a gap (the PC slept), items that have already started are skipped and the label says the time
 * actually left.
 */
export function dueReminders(
  items: Item[],
  today: IsoDate,
  fromMinutes: number,
  toMinutes: number,
  defaultLead: number,
): Reminder[] {
  const inWindow = (minute: number) => minute > fromMinutes && minute <= toMinutes;
  const reminders: Reminder[] = [];

  for (const offset of [0, 1]) {
    const date = addDays(today, offset);

    for (const { item, done } of occurrencesOn(items, date)) {
      if (done) {
        continue;
      }

      const time = item.time;

      if (time.kind === "exact") {
        const lead = item.remindMinutes ?? defaultLead;
        const start = offset * DAY + minutesOf(time.start);

        if (lead !== NO_REMINDER && inWindow(start - lead) && start >= toMinutes) {
          const where = item.place === undefined ? "" : ` · ${item.place}`;

          reminders.push({
            key: `${item.id}@${start - offset * DAY}-${lead}@${date}`,
            title: item.title,
            body: `${formatClock(time.start)}${where} (${leadLabel(start - toMinutes)})`,
          });
        }
      } else if (time.kind === "slot" && offset === 0) {
        const start = minutesOf(SLOT_START[time.slot]);

        if (inWindow(start) && start >= toMinutes) {
          reminders.push({ key: `${item.id}@${start}@${date}`, title: item.title, body: item.place ?? "" });
        }
      }
    }
  }

  const undecided = occurrencesOn(items, today).filter((o) => !o.done && o.item.time.kind === "undecided");

  if (undecided.length > 0 && inWindow(UNDECIDED_SUMMARY_AT)) {
    reminders.push({
      key: `undecided@${today}`,
      title: `오늘 시간 미정 ${undecided.length}건`,
      body: undecided.map((o) => o.item.title).join(", "),
    });
  }

  return reminders;
}

function leadLabel(minutes: number): string {
  if (minutes >= DAY) {
    return "내일";
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return hours === 0 ? `${rest}분 후` : rest === 0 ? `${hours}시간 후` : `${hours}시간 ${rest}분 후`;
}
