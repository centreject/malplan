// "말로 고치기": a short Korean request ("3시로 바꿔", "하루 미뤄", "장소는 강남역으로") applied to an item's card.
// Dates and times are computed here, as everywhere; the result goes to the edit screen before anything is saved.
import { parseKorean } from "../parse/parseKorean";
import { clockText, type Card, type CardKind } from "./card";
import { addDays, type IsoDate } from "./date";
import { shortDate } from "./format";
import type { Category } from "./item";

export type EditResult = { card: Card; changes: string[] };

/** Shown when a date change on a repeating item has no clicked occurrence to move. */
export const REPEAT_DATE_REFUSAL = "반복 일정의 날짜는 수정에서 바꿔 주세요";

const KIND_NAMES: Record<CardKind, string> = { event: "일정", task: "할 일", undated: "날짜 없는 할 일" };

/** "하루 미뤄", "다음 주로 미뤄", "이틀 당겨": a shift from the item's own date. */
const SHIFT = /(하루|이틀|사흘|나흘|일주일|한\s*주|다음\s*주|\d{1,3}\s*(?:일|주))\s*(?:로|만큼|정도)?\s*(뒤로|미뤄|미루|늦춰|늦추|연기|당겨|앞당겨|앞으로)/;

const SHIFT_DAYS = new Map([["하루", 1], ["이틀", 2], ["사흘", 3], ["나흘", 4], ["일주일", 7], ["한주", 7], ["다음주", 7]]);

const PLACE = /장소(?:는|를|을)?\s*(.+?)\s*(?:으로|로)(?=\s|$)/;

const TITLE = /제목(?:은|을|를)?\s*(.+?)\s*(?:으로|로)(?=\s|$)/;

const NOTE = /메모(?:에|를)?\s*(.+?)\s*(?:추가|적어|넣어|남겨)/;

const TIME_NAMES = { undecided: "미정", anytime: "아무때나", slot: "시간대", exact: "" } as const;

/**
 * `occurrence` is the clicked date of a repeating item. A date change there moves only that occurrence: the card
 * becomes a one-off, which saving turns into "이 일정만". With no occurrence the date change is refused.
 */
export function applyEditCommand(
  card: Card,
  text: string,
  today: IsoDate,
  categories: Category[],
  occurrence?: IsoDate,
): EditResult | typeof REPEAT_DATE_REFUSAL | undefined {
  const next: Card = { ...card };
  // A repeating card's date is the series start; "하루 미뤄" means the clicked occurrence.
  const from = card.repeat && occurrence !== undefined ? occurrence : card.date;
  let date = from;
  let rest = text;

  const shift = SHIFT.exec(rest);

  if (shift !== null) {
    const days = shiftDays(shift[1] ?? "") * (/당겨|앞당겨|앞으로/.test(shift[2] ?? "") ? -1 : 1);

    date = addDays(from, days);
    next.endDate = card.endDate === "" ? "" : addDays(card.endDate, days);
    rest = rest.replace(shift[0], " ");
  }

  rest = takeField(rest, PLACE, (place) => {
    next.place = place;
  });
  rest = takeField(rest, TITLE, (title) => {
    next.title = title;
  });
  rest = takeField(rest, NOTE, (note) => {
    next.note = card.note === "" ? note : `${card.note}\n${note}`;
  });

  // A category only when the request says so: "회사로 옮겨" could be a place.
  const named = /분류|카테고리/.test(rest) ? categories.find((c) => rest.replace(/\s/g, "").includes(`${c.name}으로`) || rest.replace(/\s/g, "").includes(`${c.name}로`)) : undefined;

  if (named !== undefined) {
    next.categoryId = named.id;
  }

  const parsed = parseKorean(rest, today);

  if (shift === null && parsed.date?.kind === "single") {
    date = parsed.date.date;
  }

  if (parsed.time?.kind === "exact") {
    next.timeMode = "exact";
    next.start = clockText(parsed.time.start);
    next.end = parsed.time.end === undefined ? keptEnd(card, next.start) : clockText(parsed.time.end);
  } else if (parsed.time?.kind === "slot") {
    next.timeMode = "slot";
    next.slot = parsed.time.slot;
  }

  if (date === from) {
    return editResult(card, next, categories);
  }

  if (!card.repeat) {
    return editResult(card, { ...next, date }, categories);
  }

  if (occurrence === undefined) {
    return REPEAT_DATE_REFUSAL;
  }

  const moved = editResult({ ...card, date: from }, { ...next, date, repeat: false }, categories);

  return moved && { ...moved, changes: [...moved.changes, "반복: 이 일정만 옮김"] };
}

/** The edited card with one line per changed field, or undefined when nothing changed. */
export function editResult(before: Card, after: Card, categories: Category[]): EditResult | undefined {
  const changes: string[] = [];

  describeChanges(before, after, categories, changes);

  return changes.length === 0 ? undefined : { card: after, changes };
}

function takeField(text: string, pattern: RegExp, apply: (value: string) => void): string {
  const match = pattern.exec(text);
  const value = match?.[1]?.trim() ?? "";

  if (match === null || value === "") {
    return text;
  }

  apply(value);

  return text.replace(match[0], " ");
}

function shiftDays(amount: string): number {
  const compact = amount.replace(/\s/g, "");
  const counted = /^(\d+)(일|주)$/.exec(compact);

  if (counted !== null) {
    return Number(counted[1]) * (counted[2] === "주" ? 7 : 1);
  }

  return SHIFT_DAYS.get(compact) ?? 0;
}

function minutesOf(clock: string): number {
  const [hour = 0, minute = 0] = clock.split(":").map(Number);

  return hour * 60 + minute;
}

/** "3시로" on a 14:00–15:30 item keeps its length (15:00–16:30); nothing kept if it had no end or would pass midnight. */
function keptEnd(card: Card, start: string): string {
  if (card.timeMode !== "exact" || card.end === "") {
    return "";
  }

  const end = minutesOf(start) + minutesOf(card.end) - minutesOf(card.start);

  return end > minutesOf(start) && end < 24 * 60 ? clockText({ hour: Math.floor(end / 60), minute: end % 60 }) : "";
}

function timeText(card: Card): string {
  if (card.timeMode === "exact") {
    return card.end === "" ? card.start : `${card.start}–${card.end}`;
  }

  return TIME_NAMES[card.timeMode];
}

/** One line per changed field, "시간: 16:00 → 15:00", shown above the edit screen. */
function describeChanges(before: Card, after: Card, categories: Category[], changes: string[]): void {
  const nameOf = (id: string) => categories.find((c) => c.id === id)?.name ?? id;

  const pairs: [string, string, string][] = [
    ["종류", KIND_NAMES[before.kind], KIND_NAMES[after.kind]],
    ["날짜", shortDate(before.date), shortDate(after.date)],
    ["시간", timeText(before), timeText(after)],
    ["제목", before.title, after.title],
    ["장소", before.place, after.place],
    ["분류", nameOf(before.categoryId), nameOf(after.categoryId)],
    ["메모", before.note, after.note],
  ];

  for (const [label, from, to] of pairs) {
    if (from !== to) {
      changes.push(`${label}: ${from === "" ? "없음" : from} → ${to}`);
    }
  }
}
