import { addDays, type IsoDate } from "./date";
import type { Item } from "./item";
import { SLOT_START, formatClock, minutesOf, occurrencesOn } from "./schedule";

export type Reminder = { key: string; title: string; body: string };

const DAY = 24 * 60;

/** Morning summary of today's undecided items. */
const UNDECIDED_SUMMARY_AT = 8 * 60;

/**
 * Reminders whose fire time falls in (fromMinutes, toMinutes] of `today`.
 * Exact times fire `remindMinutes` (or the default) before the start, possibly on the day before;
 * slots fire when the slot starts; undecided items get one morning summary. The key identifies the
 * occurrence so the caller can avoid firing twice.
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

        if (inWindow(offset * DAY + minutesOf(time.start) - lead)) {
          const where = item.place === undefined ? "" : ` · ${item.place}`;

          reminders.push({ key: `${item.id}@${date}`, title: item.title, body: `${formatClock(time.start)}${where} (${leadLabel(lead)})` });
        }
      } else if (time.kind === "slot" && offset === 0 && inWindow(minutesOf(SLOT_START[time.slot]))) {
        reminders.push({ key: `${item.id}@${date}`, title: item.title, body: item.place ?? "" });
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

  return minutes >= 60 ? `${minutes / 60}시간 후` : `${minutes}분 후`;
}
