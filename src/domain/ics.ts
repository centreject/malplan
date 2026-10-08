// iCalendar (RFC 5545) export so other calendar apps can import malplan's items.
import { addDays, type IsoDate } from "./date";
import type { Item } from "./item";
import { expand, type Recurrence } from "./recurrence";
import { SLOT_START } from "./schedule";
import type { ClockTime } from "../parse/parseKorean";

const BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** One VCALENDAR text. `stamp` is DTSTAMP in UTC, e.g. "20261008T120000Z". */
export function toIcs(items: Item[], stamp: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//malplan//KO", "CALSCALE:GREGORIAN"];

  for (const item of items) {
    lines.push(...component(item, stamp));
  }

  lines.push("END:VCALENDAR");

  return lines.flatMap(fold).map((line) => `${line}\r\n`).join("");
}

function component(item: Item, stamp: string): string[] {
  const common = [`UID:${item.id}@malplan`, `DTSTAMP:${stamp}`, `SUMMARY:${escape(item.title)}`];

  if (item.place !== undefined) {
    common.push(`LOCATION:${escape(item.place)}`);
  }

  if (item.note !== undefined) {
    common.push(`DESCRIPTION:${escape(item.note)}`);
  }

  if (item.when.kind === "none") {
    return ["BEGIN:VTODO", ...common, `STATUS:${item.done.includes("done") ? "COMPLETED" : "NEEDS-ACTION"}`, "END:VTODO"];
  }

  const when = item.when;
  const first = when.kind === "single" ? when.date : when.kind === "range" ? when.start : firstOccurrence(when.rule);
  const last = when.kind === "range" ? when.end : first;
  const clock = startClock(item);

  const timing = clock === undefined
    ? [`DTSTART;VALUE=DATE:${compact(first)}`, `DTEND;VALUE=DATE:${compact(addDays(last, 1))}`]
    : [`DTSTART:${stampOf(first, clock)}`, `DTEND:${stampOf(last, endClock(item, clock))}`];

  const recurrence = when.kind === "recurring" ? recurrenceLines(when.rule, clock) : [];

  return ["BEGIN:VEVENT", ...common, ...timing, ...recurrence, "END:VEVENT"];
}

function startClock(item: Item): ClockTime | undefined {
  if (item.time.kind === "exact") {
    return item.time.start;
  }

  return item.time.kind === "slot" ? SLOT_START[item.time.slot] : undefined;
}

/** Exact end if given, else one hour after the start. */
function endClock(item: Item, start: ClockTime): ClockTime {
  if (item.time.kind === "exact" && item.time.end !== undefined) {
    return item.time.end;
  }

  return { hour: Math.min(start.hour + 1, 23), minute: start.minute };
}

function recurrenceLines(rule: Recurrence, clock: ClockTime | undefined): string[] {
  const parts = [`FREQ=${rule.freq === "daily" ? "DAILY" : rule.freq === "weekly" ? "WEEKLY" : rule.freq === "monthly" ? "MONTHLY" : "YEARLY"}`];

  if (rule.interval !== undefined && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }

  if (rule.freq === "weekly") {
    parts.push(`BYDAY=${rule.weekdays.map((d) => BYDAY[d]).join(",")}`);
  } else if (rule.freq === "monthly") {
    // ponytail: malplan clamps day 31 to the month's last day; RFC 5545 skips such months instead.
    parts.push("day" in rule ? `BYMONTHDAY=${rule.day}` : `BYDAY=${rule.nth}${BYDAY[rule.weekday] ?? "SU"}`);
  } else if (rule.freq === "yearly") {
    parts.push(`BYMONTH=${rule.month}`, `BYMONTHDAY=${rule.day}`);
  }

  if (rule.until !== undefined) {
    parts.push(`UNTIL=${compact(rule.until)}${clock === undefined ? "" : "T235959"}`);
  }

  const lines = [`RRULE:${parts.join(";")}`];

  if (rule.except !== undefined && rule.except.length > 0) {
    lines.push(
      clock === undefined
        ? `EXDATE;VALUE=DATE:${rule.except.map(compact).join(",")}`
        : `EXDATE:${rule.except.map((d) => stampOf(d, clock)).join(",")}`,
    );
  }

  return lines;
}

/** DTSTART must be an actual occurrence. */
function firstOccurrence(rule: Recurrence): IsoDate {
  return expand(rule, { from: rule.start, to: addDays(rule.start, 400) })[0] ?? rule.start;
}

const compact = (date: IsoDate) => date.replaceAll("-", "");

const pad = (n: number) => String(n).padStart(2, "0");

const stampOf = (date: IsoDate, clock: ClockTime) => `${compact(date)}T${pad(clock.hour)}${pad(clock.minute)}00`;

function escape(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n");
}

/** Split into lines of at most 75 octets; continuation lines start with a space. */
function fold(line: string): string[] {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";

  for (const char of line) {
    const limit = out.length === 0 ? 75 : 74;

    if (encoder.encode(current + char).length > limit) {
      out.push(out.length === 0 ? current : ` ${current}`);
      current = "";
    }

    current += char;
  }

  out.push(out.length === 0 ? current : ` ${current}`);

  return out;
}
