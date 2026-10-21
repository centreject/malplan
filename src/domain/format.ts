// Korean labels the domain needs (list groups, edit summaries); the UI re-exports them from ui/format.
import { partsOf, type IsoDate } from "./date";
import type { Recurrence } from "./recurrence";

export const WEEKDAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function shortDate(date: IsoDate): string {
  const { month, day } = partsOf(date);

  return `${month}/${day}`;
}

/** "매주 월·목", "3개월마다 10일", "격주 수 (12/28까지)". */
export function recurrenceLabel(rule: Recurrence): string {
  const until = rule.until === undefined ? "" : ` (${shortDate(rule.until)}까지)`;
  const n = rule.interval ?? 1;
  const every = (unit: string, plain: string) => (n > 1 ? `${n}${unit}마다` : plain);

  switch (rule.freq) {
    case "daily":
      return `${every("일", "매일")}${until}`;
    case "weekly": {
      const days = rule.weekdays.map((weekday) => WEEKDAY_NAMES[weekday]).join("·");

      return `${n === 2 ? "격주" : every("주", "매주")} ${days}${until}`;
    }

    case "monthly": {
      const on = "day" in rule ? `${rule.day}일` : `${rule.nth === -1 ? "마지막" : `${rule.nth}째`} ${WEEKDAY_NAMES[rule.weekday]}요일`;

      return `${every("개월", "매월")} ${on}${until}`;
    }

    case "yearly":
      return `${every("년", "매년")} ${rule.month}/${rule.day}${until}`;
  }
}
