// The confirm/edit screen works on a flat, form-shaped Card; these pure
// functions convert between it, the parser's result and the stored Item.
import type { ClockTime, Flag, ParseResult, Slot } from "../parse/parseKorean";
import { partsOf, weekdayOf, type IsoDate, type Weekday } from "./date";
import type { Category, Item, ItemTime, ItemWhen } from "./item";
import type { Recurrence } from "./recurrence";

export type CardKind = "event" | "task" | "undated";

export type RepeatFreq = "daily" | "weekly" | "biweekly" | "monthlyDay" | "monthlyNth" | "yearly";

/** `categoryId` value meaning "create the category named in `newCategory` on confirm". */
export const NEW_CATEGORY = "+new";

export type Card = {
  title: string;
  kind: CardKind;
  /** Single date, range start, or recurrence start. */
  date: IsoDate;
  /** Range end; "" = single day. Ignored when repeating. */
  endDate: string;
  repeat: boolean;
  freq: RepeatFreq;
  weekdays: Weekday[];
  /** Day of month for monthlyDay and yearly. */
  monthDay: number;
  /** 1..4, or -1 for the last one. */
  nth: number;
  nthWeekday: Weekday;
  yearMonth: number;
  /** Inclusive repeat end; "" = forever. */
  until: string;
  /** Skipped occurrences, carried through untouched. */
  except: IsoDate[];
  timeMode: ItemTime["kind"];
  /** "HH:MM" as native time inputs use; end "" = none. */
  start: string;
  end: string;
  slot: Slot;
  categoryId: string;
  newCategory: string;
  place: string;
  note: string;
  remindMinutes: number | undefined;
  done: string[];
  /** Parser guesses to badge as "추정". */
  flags: Flag[];
};

export type Draft = { id: string; card: Card };

export type Committed = { items: Item[]; categories: Category[] };

export type CardErrors = Partial<
  Record<"title" | "date" | "endDate" | "until" | "weekdays" | "start" | "end" | "newCategory", string>
>;

const TASK_ENDINGS = ["하기", "제출", "발송", "보내기", "마감", "예약", "신청", "반납", "사기"];

/** Default kind from the title's ending verb. The LLM replaces this later. */
export function guessKind(title: string): "event" | "task" {
  const trimmed = title.trim();

  return TASK_ENDINGS.some((ending) => trimmed.endsWith(ending)) ? "task" : "event";
}

/** First category whose name appears in the title, else the first category. The LLM replaces this later. */
export function guessCategory(title: string, categories: Category[]): string {
  return categories.find((c) => title.includes(c.name))?.id ?? categories[0]?.id ?? "";
}

// ponytail: splits only on newlines and ';'; smarter splitting ("내일 치과 그리고 모레 회의") is the LLM's job later.
export function splitInput(text: string): string[] {
  return text.split(/[\n;]/).flatMap((part) => (part.trim() === "" ? [] : [part.trim()]));
}

/** Repeat fields pre-filled from a date, so turning repeat on starts from something sensible. */
export function repeatSeed(date: IsoDate): Pick<Card, "weekdays" | "monthDay" | "nth" | "nthWeekday" | "yearMonth"> {
  const { month, day } = partsOf(date);
  const nth = Math.ceil(day / 7);

  return {
    weekdays: [weekdayOf(date)],
    monthDay: day,
    nth: nth > 4 ? -1 : nth,
    nthWeekday: weekdayOf(date),
    yearMonth: month,
  };
}

export function cardFromParse(parse: ParseResult, today: IsoDate, categories: Category[]): Card {
  const kind = guessKind(parse.rest);
  const task = kind === "task";

  const item: Item = {
    id: "",
    title: parse.rest,
    kind,
    categoryId: guessCategory(parse.rest, categories),
    when: parse.date ?? (task ? { kind: "none" } : { kind: "single", date: today }),
    time: parse.time ?? (task ? { kind: "anytime" } : { kind: "undecided" }),
    done: [],
  };

  return { ...cardFromItem(item, today), flags: parse.flags };
}

export function cardFromItem(item: Item, today: IsoDate): Card {
  const { when, time } = item;
  const date = when.kind === "single" ? when.date : when.kind === "range" ? when.start : when.kind === "recurring" ? when.rule.start : today;

  const card: Card = {
    title: item.title,
    kind: when.kind === "none" ? "undated" : item.kind,
    date,
    endDate: when.kind === "range" ? when.end : "",
    repeat: when.kind === "recurring",
    freq: "weekly",
    ...repeatSeed(date),
    until: "",
    except: [],
    timeMode: time.kind,
    start: time.kind === "exact" ? clockText(time.start) : "",
    end: time.kind === "exact" && time.end !== undefined ? clockText(time.end) : "",
    slot: time.kind === "slot" ? time.slot : "morning",
    categoryId: item.categoryId,
    newCategory: "",
    place: item.place ?? "",
    note: item.note ?? "",
    remindMinutes: item.remindMinutes,
    done: item.done,
    flags: [],
  };

  return when.kind === "recurring" ? { ...card, ...repeatFields(when.rule) } : card;
}

function repeatFields(rule: Recurrence): Partial<Card> {
  const common = { until: rule.until ?? "", except: rule.except ?? [] };

  switch (rule.freq) {
    case "daily":
      return { ...common, freq: "daily" };
    case "weekly":
      return { ...common, freq: rule.interval === 2 ? "biweekly" : "weekly", weekdays: rule.weekdays };
    case "monthly":
      return "day" in rule
        ? { ...common, freq: "monthlyDay", monthDay: rule.day }
        : { ...common, freq: "monthlyNth", nth: rule.nth, nthWeekday: rule.weekday };
    case "yearly":
      return { ...common, freq: "yearly", yearMonth: rule.month, monthDay: rule.day };
  }
}

export function itemFromCard(card: Card, id: string): Item {
  const item: Item = {
    id,
    title: card.title.trim(),
    kind: card.kind === "event" ? "event" : "task",
    categoryId: card.categoryId,
    when: whenFromCard(card),
    time: card.kind === "undated" ? { kind: "anytime" } : timeFromCard(card),
    done: card.done,
  };

  if (card.place.trim() !== "") {
    item.place = card.place.trim();
  }

  if (card.note.trim() !== "") {
    item.note = card.note.trim();
  }

  if (card.remindMinutes !== undefined) {
    item.remindMinutes = card.remindMinutes;
  }

  return item;
}

function whenFromCard(card: Card): ItemWhen {
  if (card.kind === "undated") {
    return { kind: "none" };
  }

  if (card.repeat) {
    return { kind: "recurring", rule: ruleFromCard(card) };
  }

  return card.endDate === "" ? { kind: "single", date: card.date } : { kind: "range", start: card.date, end: card.endDate };
}

// ponytail: only weekly carries an interval (격주 = 2); other intervals are dropped on edit until the editor offers them.
function ruleFromCard(card: Card): Recurrence {
  const rule = baseRule(card);

  if (card.until !== "") {
    rule.until = card.until;
  }

  if (card.except.length > 0) {
    rule.except = card.except;
  }

  return rule;
}

function baseRule(card: Card): Recurrence {
  const start = card.date;
  const weekdays = card.weekdays.toSorted((a, b) => a - b);

  switch (card.freq) {
    case "daily":
      return { freq: "daily", start };
    case "weekly":
      return { freq: "weekly", weekdays, start };
    case "biweekly":
      return { freq: "weekly", weekdays, start, interval: 2 };
    case "monthlyDay":
      return { freq: "monthly", day: card.monthDay, start };
    case "monthlyNth":
      return { freq: "monthly", nth: card.nth, weekday: card.nthWeekday, start };
    case "yearly":
      return { freq: "yearly", month: card.yearMonth, day: card.monthDay, start };
  }
}

function timeFromCard(card: Card): ItemTime {
  switch (card.timeMode) {
    case "exact":
      return card.end === ""
        ? { kind: "exact", start: clockOf(card.start) }
        : { kind: "exact", start: clockOf(card.start), end: clockOf(card.end) };
    case "slot":
      return { kind: "slot", slot: card.slot };
    case "undecided":
      return { kind: "undecided" };
    case "anytime":
      return { kind: "anytime" };
  }
}

function clockText(clock: ClockTime): string {
  return `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}

function clockOf(text: string): ClockTime {
  const [hour = 0, minute = 0] = text.split(":").map(Number);

  return { hour, minute };
}

/** Inline validation; any entry blocks 확인. Fields hidden by the current kind/mode are not checked. */
export function cardErrors(card: Card): CardErrors {
  const errors: CardErrors = {};

  if (card.title.trim() === "") {
    errors.title = "제목을 입력하세요.";
  }

  if (card.categoryId === NEW_CATEGORY && card.newCategory.trim() === "") {
    errors.newCategory = "새 분류 이름을 입력하세요.";
  }

  if (card.kind === "undated") {
    return errors;
  }

  if (card.date === "") {
    errors.date = "날짜를 고르세요.";
  }

  if (!card.repeat && card.endDate !== "" && card.endDate < card.date) {
    errors.endDate = "종료일이 시작일보다 빠릅니다.";
  }

  if (card.repeat && card.until !== "" && card.until < card.date) {
    errors.until = "종료일이 시작일보다 빠릅니다.";
  }

  if (card.repeat && (card.freq === "weekly" || card.freq === "biweekly") && card.weekdays.length === 0) {
    errors.weekdays = "요일을 하나 이상 고르세요.";
  }

  if (card.timeMode === "exact" && card.start === "") {
    errors.start = "시작 시각을 입력하세요.";
  }

  if (card.timeMode === "exact" && card.end !== "" && card.end < card.start) {
    errors.end = "끝 시각이 시작 시각보다 빠릅니다.";
  }

  return errors;
}

/**
 * Saves confirmed drafts into `items` (same id = replace in place, else append),
 * creating each requested new category once.
 */
export function commitCards(drafts: Draft[], items: Item[], categories: Category[], makeId: () => string): Committed {
  let next = categories;

  const saved = drafts.map(({ id, card }) => {
    if (card.categoryId !== NEW_CATEGORY) {
      return itemFromCard(card, id);
    }

    const name = card.newCategory.trim();
    let category = next.find((c) => c.name === name);

    if (category === undefined) {
      category = { id: makeId(), name, colorSlot: (next.length % 6) + 1 };
      next = [...next, category];
    }

    return itemFromCard({ ...card, categoryId: category.id }, id);
  });

  const byId = new Map(saved.map((item) => [item.id, item]));
  const storedIds = new Set(items.map((item) => item.id));

  return {
    items: [...items.map((item) => byId.get(item.id) ?? item), ...saved.filter((item) => !storedIds.has(item.id))],
    categories: next,
  };
}
