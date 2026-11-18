// iCalendar (RFC 5545) import: events and todos from another calendar app become malplan items. Text from outside, so
// every value is checked here and anything this app cannot represent is reported rather than guessed.
import { addDays, isRealDate, makeDate, weekdayOf, type IsoDate, type Weekday } from "./date";
import type { Item, ItemTime, ItemWhen } from "./item";
import { expand, type Recurrence } from "./recurrence";
import type { ClockTime } from "../parse/parseKorean";

export type IcsImport = { items: Item[]; warnings: string[] };

/** One property line: name, parameters (upper-cased keys) and the raw value. */
type Property = { name: string; params: Map<string, string>; value: string };

/** A moment as written in the file: a date alone, or a date and a wall-clock time in `zone`'s terms. */
type Moment = { date: IsoDate; clock?: ClockTime };

const BYDAY: ReadonlyMap<string, Weekday> = new Map([["SU", 0], ["MO", 1], ["TU", 2], ["WE", 3], ["TH", 4], ["FR", 5], ["SA", 6]]);

/** How far a COUNT is looked for: a rule that never reaches its count in this time is read as endless. */
const COUNT_SEARCH_DAYS = 366 * 30;

/**
 * Reads a VCALENDAR text. `zone` is this device's time zone (e.g. "Asia/Seoul"): times in UTC or in another zone are
 * moved to it. Items go to `categoryId`. An item malplan exported keeps its id, so importing it again replaces it.
 */
export function parseIcs(text: string, zone: string, categoryId: string): IcsImport {
  const warnings: string[] = [];
  const items: Item[] = [];
  let skippedOverrides = 0;

  for (const component of components(unfold(text))) {
    const props = component.props;
    const first = (name: string) => props.find((p) => p.name === name);
    const summary = unescape(first("SUMMARY")?.value ?? "").trim();

    if (first("RECURRENCE-ID") !== undefined) {
      skippedOverrides += 1;
      continue;
    }

    if (component.kind === "VEVENT" && first("STATUS")?.value.toUpperCase() === "CANCELLED") {
      continue;
    }

    const title = summary === "" ? "(제목 없음)" : summary;
    const built = component.kind === "VEVENT" ? eventWhen(props, zone, title, warnings) : todoWhen(props, zone);

    if (built === undefined) {
      warnings.push(`${title}: 날짜를 읽지 못해 건너뛰었습니다.`);
      continue;
    }

    const uid = first("UID")?.value.trim() ?? "";

    const item: Item = {
      id: uid === "" ? `ics-${items.length}-${title}` : uid.endsWith("@malplan") ? uid.slice(0, -"@malplan".length) : `ics-${uid}`,
      title,
      kind: component.kind === "VTODO" || first("X-MALPLAN-KIND")?.value.trim() === "task" ? "task" : "event",
      categoryId,
      when: built.when,
      time: built.time,
      done: [],
    };

    const place = unescape(first("LOCATION")?.value ?? "").trim();
    const note = unescape(first("DESCRIPTION")?.value ?? "").trim();

    if (place !== "") item.place = place;

    if (note !== "") item.note = note;

    if (component.kind === "VTODO" && first("STATUS")?.value.toUpperCase() === "COMPLETED") {
      item.done = [item.when.kind === "single" ? item.when.date : "done"];
    }

    items.push(item);
  }

  if (skippedOverrides > 0) {
    warnings.push(`반복 일정에서 따로 고친 회차 ${skippedOverrides}개는 가져오지 않았습니다(반복 규칙대로 들어갑니다).`);
  }

  return { items, warnings };
}

type Built = { when: ItemWhen; time: ItemTime };

function eventWhen(props: Property[], zone: string, title: string, warnings: string[]): Built | undefined {
  const startProp = props.find((p) => p.name === "DTSTART");
  const start = startProp === undefined ? undefined : moment(startProp, zone);

  if (start === undefined) {
    return undefined;
  }

  const endProp = props.find((p) => p.name === "DTEND");
  const end = endProp === undefined ? afterDuration(start, props.find((p) => p.name === "DURATION")?.value) : moment(endProp, zone);
  const rrule = props.find((p) => p.name === "RRULE");

  if (rrule !== undefined) {
    const rule = recurrence(rrule.value, start.date, zone, props);

    if (rule !== undefined) {
      return { when: { kind: "recurring", rule }, time: timeOf(start, end) };
    }

    warnings.push(`${title}: 반복 규칙을 읽지 못해 첫 날만 가져왔습니다.`);
  }

  // A date-only end is exclusive (the day after the last); a timed one past midnight within a day is an overnight time.
  const last = end === undefined ? start.date : start.clock === undefined || end.clock === undefined ? addDays(end.date, -1) : end.date;
  const overnight = start.clock !== undefined && end?.clock !== undefined && last === addDays(start.date, 1) && minutesOf(end.clock) <= minutesOf(start.clock);

  if (last > start.date && !overnight) {
    return { when: { kind: "range", start: start.date, end: last }, time: start.clock === undefined ? { kind: "anytime" } : { kind: "exact", start: start.clock } };
  }

  return { when: { kind: "single", date: start.date }, time: timeOf(start, end) };
}

function todoWhen(props: Property[], zone: string): Built | undefined {
  const dueProp = props.find((p) => p.name === "DUE") ?? props.find((p) => p.name === "DTSTART");

  if (dueProp === undefined) {
    return { when: { kind: "none" }, time: { kind: "anytime" } };
  }

  const due = moment(dueProp, zone);

  return due === undefined ? undefined : { when: { kind: "single", date: due.date }, time: timeOf(due, undefined) };
}

function timeOf(start: Moment, end: Moment | undefined): ItemTime {
  if (start.clock === undefined) {
    return { kind: "anytime" };
  }

  return end?.clock === undefined || sameClock(end.clock, start.clock) ? { kind: "exact", start: start.clock } : { kind: "exact", start: start.clock, end: end.clock };
}

/** DTSTART/DTEND/DUE/EXDATE value: a date, a floating time, a UTC time ("Z"), or a time in its TZID. */
function moment(prop: Property, zone: string, value = prop.value.trim()): Moment | undefined {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value);

  if (match === null) {
    return undefined;
  }

  const [, y, mo, d, h, mi, , utc] = match;
  const date = `${y}-${mo}-${d}`;

  if (!isRealDate(date)) {
    return undefined;
  }

  if (h === undefined || mi === undefined || prop.params.get("VALUE") === "DATE") {
    return { date };
  }

  const wall = { date, clock: { hour: Number(h), minute: Number(mi) } };
  const from = utc === "Z" ? "UTC" : prop.params.get("TZID");

  return from === undefined || from === zone ? wall : inZone(wall, from, zone);
}

/** Moves a wall-clock moment in `from` to `to`. A zone name the platform does not know (Outlook's "Korea Standard Time") stays as written. */
function inZone(wall: Required<Moment>, from: string, to: string): Moment {
  try {
    const [y, m, d] = wall.date.split("-").map(Number);
    const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, wall.clock.hour, wall.clock.minute);
    const instant = guess - offsetMs(guess, from);

    return wallIn(instant, to);
  } catch {
    return wall;
  }
}

/** How far `zone`'s wall clock is ahead of UTC at `instant`. */
function offsetMs(instant: number, zone: string): number {
  const wall = wallIn(instant, zone);
  const [y, m, d] = wall.date.split("-").map(Number);

  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, wall.clock?.hour ?? 0, wall.clock?.minute ?? 0) - Math.floor(instant / 60_000) * 60_000;
}

function wallIn(instant: number, zone: string): Moment {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";

  return { date: `${part("year")}-${part("month")}-${part("day")}`, clock: { hour: Number(part("hour")), minute: Number(part("minute")) } };
}

/** DURATION such as "PT1H30M" or "P1D" after `start`; anything else is no end. */
function afterDuration(start: Moment, duration: string | undefined): Moment | undefined {
  const match = duration === undefined ? null : /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?)?$/.exec(duration.trim());

  if (match === null) {
    return undefined;
  }

  const days = Number(match[1] ?? 0) * 7 + Number(match[2] ?? 0);

  if (start.clock === undefined) {
    return { date: addDays(start.date, days) };
  }

  const total = minutesOf(start.clock) + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);

  return { date: addDays(start.date, days + Math.floor(total / 1440)), clock: { hour: Math.floor(total / 60) % 24, minute: total % 60 } };
}

/** The RRULE subset malplan can hold; anything else is undefined (the caller keeps the first day only). */
function recurrence(value: string, start: IsoDate, zone: string, props: Property[]): Recurrence | undefined {
  const parts = new Map(value.split(";").map((pair) => {
    const [key = "", val = ""] = pair.split("=");

    return [key.trim().toUpperCase(), val.trim().toUpperCase()] as const;
  }));

  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY", "BYMONTH", "UNTIL", "COUNT", "WKST"]);

  if ([...parts.keys()].some((key) => !known.has(key))) {
    return undefined;
  }

  const interval = Number(parts.get("INTERVAL") ?? "1");

  if (!Number.isInteger(interval) || interval < 1) {
    return undefined;
  }

  const base: Base = { start };

  if (interval > 1) {
    base.interval = interval;
  }

  const rule = ruleOfFreq(parts, base, start);

  if (rule === undefined) {
    return undefined;
  }

  const except = props
    .filter((p) => p.name === "EXDATE")
    .flatMap((p) => p.value.split(",").map((v) => moment(p, zone, v.trim())?.date))
    .filter((d): d is IsoDate => d !== undefined);

  const untilText = parts.get("UNTIL");
  const until = untilText === undefined ? undefined : moment({ name: "UNTIL", params: new Map(), value: untilText }, zone)?.date;
  const count = parts.get("COUNT");
  const end = until ?? (count === undefined ? undefined : countEnd(rule, Number(count)));

  const result: Recurrence = { ...rule };

  if (end !== undefined) {
    result.until = end;
  }

  if (except.length > 0) {
    result.except = [...new Set(except)].toSorted();
  }

  return result;
}

type Base = { start: IsoDate; interval?: number };

/** FREQ with its BYDAY / BYMONTHDAY / BYMONTH, as one of malplan's rule kinds. */
function ruleOfFreq(parts: ReadonlyMap<string, string>, base: Base, start: IsoDate): Recurrence | undefined {
  const byDay = parts.get("BYDAY")?.split(",").filter((d) => d !== "") ?? [];
  const monthDay = parts.get("BYMONTHDAY");
  const [year, month, day] = start.split("-").map(Number);

  switch (parts.get("FREQ")) {
    case "DAILY":
      return byDay.length === 0 && monthDay === undefined ? { ...base, freq: "daily" } : undefined;
    case "WEEKLY": {
      const weekdays = byDay.map((d) => BYDAY.get(d));

      if (weekdays.some((d) => d === undefined)) return undefined;

      // SAFETY: the line above returned when any day was unknown.
      return { ...base, freq: "weekly", weekdays: (weekdays.length === 0 ? [weekdayOf(start)] : weekdays) as Weekday[] };
    }

    case "MONTHLY": {
      if (byDay.length === 1) {
        const match = /^(-1|[1-4])(SU|MO|TU|WE|TH|FR|SA)$/.exec(byDay[0] ?? "");
        const weekday = BYDAY.get(match?.[2] ?? "");

        return match === null || weekday === undefined ? undefined : { ...base, freq: "monthly", nth: Number(match[1]), weekday };
      }

      const dayOfMonth = Number(monthDay ?? day);

      return byDay.length === 0 && Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31 ? { ...base, freq: "monthly", day: dayOfMonth } : undefined;
    }

    case "YEARLY": {
      const m = Number(parts.get("BYMONTH") ?? month);
      const d = Number(monthDay ?? day);

      return byDay.length === 0 && isRealDate(makeDate(year ?? 2000, m, d)) ? { ...base, freq: "yearly", month: m, day: d } : undefined;
    }

    default:
      return undefined;
  }
}

/** The date of the COUNT-th occurrence; undefined when it is not reached in COUNT_SEARCH_DAYS. */
function countEnd(rule: Recurrence, count: number): IsoDate | undefined {
  if (!Number.isInteger(count) || count < 1) {
    return undefined;
  }

  return expand(rule, { from: rule.start, to: addDays(rule.start, COUNT_SEARCH_DAYS) })[count - 1];
}

type Component = { kind: "VEVENT" | "VTODO"; props: Property[] };

/** VEVENT and VTODO blocks; others (VTIMEZONE, VALARM inside events) are passed over. */
function components(lines: string[]): Component[] {
  const found: Component[] = [];
  let current: Component | undefined;
  let nested = 0;

  for (const line of lines) {
    const prop = property(line);

    if (prop === undefined) continue;

    if (prop.name === "BEGIN") {
      if (current !== undefined) nested += 1;
      else if (prop.value === "VEVENT" || prop.value === "VTODO") current = { kind: prop.value, props: [] };
    } else if (prop.name === "END") {
      if (nested > 0) nested -= 1;
      else if (current !== undefined && prop.value === current.kind) {
        found.push(current);
        current = undefined;
      }
    } else if (current !== undefined && nested === 0) {
      current.props.push(prop);
    }
  }

  return found;
}

/** "NAME;PARAM=x;PARAM2=y:value". A parameter value may be quoted and hold ':' or ';'. */
function property(line: string): Property | undefined {
  const match = /^([A-Za-z0-9-]+)((?:;[A-Za-z0-9-]+=(?:"[^"]*"|[^;:]*))*):(.*)$/.exec(line);

  if (match === null) {
    return undefined;
  }

  const params = new Map<string, string>();

  for (const param of (match[2] ?? "").matchAll(/;([A-Za-z0-9-]+)=("[^"]*"|[^;:]*)/g)) {
    params.set((param[1] ?? "").toUpperCase(), (param[2] ?? "").replaceAll('"', ""));
  }

  return { name: (match[1] ?? "").toUpperCase(), params, value: match[3] ?? "" };
}

/** Joins folded lines (a line starting with a space or tab continues the one before). */
function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter((line) => line !== "");
}

function unescape(text: string): string {
  return text.replace(/\\([\\;,nN])/g, (_, char: string) => (char === "n" || char === "N" ? "\n" : char));
}

function minutesOf(clock: ClockTime): number {
  return clock.hour * 60 + clock.minute;
}

function sameClock(a: ClockTime, b: ClockTime): boolean {
  return a.hour === b.hour && a.minute === b.minute;
}
