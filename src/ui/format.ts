import { partsOf, weekdayOf, type IsoDate } from "../domain/date";
import type { ItemTime } from "../domain/item";
import { formatClock } from "../domain/schedule";
import type { ParseResult, Slot } from "../parse/parseKorean";

export const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

export const SLOT_NAMES: Record<Slot, string> = {
  morning: "아침",
  lunch: "점심",
  dinner: "저녁",
  night: "밤",
};

export function timeLabel(time: ItemTime): string {
  switch (time.kind) {
    case "undecided":
      return "미정";
    case "anytime":
      return "아무때나";
    case "slot":
      return SLOT_NAMES[time.slot];
    case "exact":
      return time.end === undefined
        ? formatClock(time.start)
        : `${formatClock(time.start)}–${formatClock(time.end)}`;
  }
}

/** Start clock for exact times only; untimed and slot items show nothing in tight cells. */
export function startLabel(time: ItemTime): string {
  return time.kind === "exact" ? formatClock(time.start) : "";
}

export function weekdayName(date: IsoDate): string {
  return WEEKDAY_NAMES[weekdayOf(date)] ?? "";
}

export function monthDay(date: IsoDate): string {
  const { month, day } = partsOf(date);

  return `${month}월 ${day}일`;
}

export function shortDate(date: IsoDate): string {
  const { month, day } = partsOf(date);

  return `${month}/${day}`;
}

export function untilLabel(minutes: number): string {
  if (minutes < 1) {
    return "지금";
  }

  if (minutes < 60) {
    return `${minutes}분 후`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest === 0 ? `${hours}시간 후` : `${hours}시간 ${rest}분 후`;
}

/** One-line preview of what the parser understood, shown under the input. */
export function parseSummary(result: ParseResult): string {
  const parts: string[] = [];
  const date = result.date;

  if (date?.kind === "single") {
    parts.push(`${shortDate(date.date)} (${weekdayName(date.date)})`);
  } else if (date?.kind === "range") {
    parts.push(`${shortDate(date.start)}–${shortDate(date.end)}`);
  } else if (date?.kind === "recurring") {
    parts.push(recurrenceLabel(date.rule));
  }

  if (result.time?.kind === "exact") {
    parts.push(result.time.end === undefined
      ? formatClock(result.time.start)
      : `${formatClock(result.time.start)}–${formatClock(result.time.end)}`);
  } else if (result.time?.kind === "slot") {
    parts.push(SLOT_NAMES[result.time.slot]);
  }

  if (result.rest !== "") {
    parts.push(result.rest);
  }

  return parts.join(" · ");
}

function recurrenceLabel(rule: NonNullable<Extract<ParseResult["date"], { kind: "recurring" }>>["rule"]): string {
  const until = rule.until === undefined ? "" : ` (${shortDate(rule.until)}까지)`;

  switch (rule.freq) {
    case "daily":
      return `매일${until}`;
    case "weekly": {
      const days = rule.weekdays.map((weekday) => WEEKDAY_NAMES[weekday]).join("·");

      return `${rule.interval === 2 ? "격주" : "매주"} ${days}${until}`;
    }

    case "monthly":
      if ("day" in rule) {
        return `매월 ${rule.day}일${until}`;
      }

      return `매월 ${rule.nth === -1 ? "마지막" : `${rule.nth}째`} ${WEEKDAY_NAMES[rule.weekday]}요일${until}`;
    case "yearly":
      return `매년 ${rule.month}/${rule.day}${until}`;
  }
}
