// What the malplan MCP server can do, over a sync store. No MCP or Node here, so it runs in tests.
// Dates are always read by the app's own parser from a Korean sentence: the calling model never computes them.
import { cardErrors, cardFromItem, cardFromParse, commitCards, itemFromCard, type Card } from "../domain/card";
import { addDays, weekdayOf, type IsoDate } from "../domain/date";
import { WEEKDAY_NAMES, recurrenceLabel, shortDate } from "../domain/format";
import type { Category, Item } from "../domain/item";
import { REPEAT_DATE_REFUSAL, applyEditCommand } from "../domain/editCommand";
import { doneKey, occurrencesOn, occursOn } from "../domain/schedule";
import { deleteOccurrence, editOccurrence, type SeriesScope } from "../domain/series";
import { searchItems } from "../domain/search";
import { parseKorean } from "../parse/parseKorean";
import { boardFromEntities, boardWrites, type Board } from "../storage/board";
import type { SyncStore } from "../storage/store";
import { timeLabel } from "../ui/format";

export async function loadBoard(store: SyncStore): Promise<Board> {
  await store.load();

  return boardFromEntities(store.entities()).board;
}

function day(date: IsoDate): string {
  return `${shortDate(date)}(${WEEKDAY_NAMES[weekdayOf(date)]})`;
}

function when(item: Item): string {
  switch (item.when.kind) {
    case "single":
      return day(item.when.date);
    case "range":
      return `${day(item.when.start)}–${day(item.when.end)}`;
    case "recurring":
      return recurrenceLabel(item.when.rule);
    case "none":
      return "날짜 없음";
  }
}

function categoryName(categories: Category[], id: string): string {
  return categories.find((c) => c.id === id)?.name ?? "분류 없음";
}

/** One line an assistant can read back to the user: "회의 · 10/23(금) · 15:00 · 회사 · 장소 3층 · 일정". */
export function describe(item: Item, categories: Category[]): string {
  const parts = [item.title, when(item), timeLabel(item.time), categoryName(categories, item.categoryId)];

  if (item.place !== undefined && item.place !== "") {
    parts.push(`장소 ${item.place}`);
  }

  parts.push(item.kind === "task" ? "할 일" : "일정");

  return parts.join(" · ");
}

/** Each day from `from` for `days` days, with what happens on it. */
export function listSchedule(board: Board, from: IsoDate, days: number): string {
  const lines = Array.from({ length: days }, (_, index) => addDays(from, index)).flatMap((date) => {
    const occurrences = occurrencesOn(board.items, date);

    return occurrences.length === 0
      ? []
      : [
          `${day(date)}`,
          ...occurrences.map(
            ({ item, done }) => `  - ${timeLabel(item.time)} ${item.title} [${categoryName(board.categories, item.categoryId)}]${item.kind === "task" ? (done ? " (완료)" : " (할 일)") : ""} id=${item.id}`,
          ),
        ];
  });

  return lines.length === 0 ? `${day(from)}부터 ${days}일 동안 일정이 없습니다.` : lines.join("\n");
}

export function findSchedule(board: Board, query: string, today: IsoDate): string {
  const results = searchItems(board.items, query, today, { categories: board.categories });

  return results.length === 0
    ? `"${query}"에 맞는 일정이 없습니다.`
    : results.map(({ item, date }) => `- ${describe(item, board.categories)}${date === undefined ? "" : ` (다음: ${day(date)})`} id=${item.id}`).join("\n");
}

type ParsedSentence = { card: Card; problems: string[] };

/** `nowMinutes`: the current minute, for "10분 후". */
function cardOf(board: Board, sentence: string, today: IsoDate, nowMinutes?: number): ParsedSentence {
  const card = cardFromParse(parseKorean(sentence, today, nowMinutes), today, board.categories);

  return { card, problems: Object.values(cardErrors(card)) };
}

/** What add_schedule would save, without saving. */
export function previewSchedule(board: Board, sentence: string, today: IsoDate, nowMinutes?: number): string {
  const { card, problems } = cardOf(board, sentence, today, nowMinutes);

  if (problems.length > 0) {
    return `저장할 수 없습니다: ${problems.join(" ")}`;
  }

  const { items, categories } = commitCards([{ id: "preview", card }], [], board.categories, () => "preview");
  const item = items[0];

  return item === undefined ? "읽을 수 없는 문장입니다." : `저장하면: ${describe(item, categories)}`;
}

export type Saved = { text: string; next: Board };

/** Saves the sentence as the app's confirm screen would with no edits. */
export async function addSchedule(
  store: SyncStore,
  board: Board,
  sentence: string,
  today: IsoDate,
  makeId: () => string,
  nowMinutes?: number,
): Promise<Saved> {
  const { card, problems } = cardOf(board, sentence, today, nowMinutes);

  if (problems.length > 0) {
    return { text: `저장하지 않았습니다: ${problems.join(" ")}`, next: board };
  }

  const id = makeId();
  const committed = commitCards([{ id, card }], board.items, board.categories, makeId);
  const next = { ...board, items: committed.items, categories: committed.categories };
  const item = next.items.find((i) => i.id === id);

  await store.setMany(boardWrites(board, next));

  return { text: item === undefined ? "저장했습니다." : `저장했습니다: ${describe(item, next.categories)} id=${id}`, next };
}

/** Marks a task done; a repeating task needs the occurrence date. */
export async function completeTask(store: SyncStore, board: Board, id: string, date: IsoDate | undefined): Promise<Saved> {
  const item = board.items.find((i) => i.id === id);

  if (item === undefined || item.kind !== "task") {
    return { text: "그 id의 할 일이 없습니다. list_schedule이나 find_schedule로 id를 확인하세요.", next: board };
  }

  const key = doneKey(item, date);

  if (key === undefined) {
    return { text: "반복 할 일은 완료할 날짜(date)가 필요합니다.", next: board };
  }

  // Otherwise the mark lands on a day the task never shows, and nothing on the board changes.
  if (item.when.kind === "recurring" && !occursOn(item, key)) {
    return { text: `그 날짜에는 이 할 일이 없습니다: ${item.title} (${day(key)}). list_schedule로 회차 날짜를 확인하세요.`, next: board };
  }

  if (item.done.includes(key)) {
    return { text: `이미 완료된 할 일입니다: ${item.title}`, next: board };
  }

  const next = { ...board, items: board.items.map((i) => (i.id === id ? { ...i, done: [...i.done, key] } : i)) };

  await store.setMany(boardWrites(board, next));

  return { text: `완료했습니다: ${item.title}${key === "done" ? "" : ` (${day(key)})`}`, next };
}

const NO_ITEM = "그 id의 항목이 없습니다. list_schedule이나 find_schedule로 id를 확인하세요.";

/** Takes a task's done mark off again; a repeating task needs the occurrence date. */
export async function uncompleteTask(store: SyncStore, board: Board, id: string, date: IsoDate | undefined): Promise<Saved> {
  const item = board.items.find((i) => i.id === id);

  if (item === undefined || item.kind !== "task") {
    return { text: NO_ITEM, next: board };
  }

  const key = doneKey(item, date);

  if (key === undefined) {
    return { text: "반복 할 일은 완료를 취소할 날짜(date)가 필요합니다.", next: board };
  }

  if (!item.done.includes(key)) {
    return { text: `완료된 할 일이 아닙니다: ${item.title}${key === "done" ? "" : ` (${day(key)})`}`, next: board };
  }

  const next = { ...board, items: board.items.map((i) => (i.id === id ? { ...i, done: i.done.filter((d) => d !== key) } : i)) };

  await store.setMany(boardWrites(board, next));

  return { text: `완료를 취소했습니다: ${item.title}${key === "done" ? "" : ` (${day(key)})`}`, next };
}

/**
 * The app's "말로 고치기" on one item: "3시로 바꿔", "하루 미뤄", "금요일로", "장소는 강남역으로", "제목은 ~로". Without
 * `save` it only says what would change. On a repeating item, `date` is the occurrence: a date change moves only
 * that one; other changes apply to the whole series.
 */
export async function editSchedule(
  store: SyncStore,
  board: Board,
  request: { id: string; text: string; date: IsoDate | undefined; save: boolean },
  today: IsoDate,
  makeId: () => string,
): Promise<Saved> {
  const item = board.items.find((i) => i.id === request.id);

  if (item === undefined) {
    return { text: NO_ITEM, next: board };
  }

  const recurring = item.when.kind === "recurring";

  if (recurring && request.date !== undefined && !occursOn(item, request.date)) {
    return { text: `그 날짜에는 이 일정이 없습니다: ${item.title} (${day(request.date)})`, next: board };
  }

  const result = applyEditCommand(cardFromItem(item, today), request.text, today, board.categories, recurring ? request.date : undefined);

  if (result === REPEAT_DATE_REFUSAL) {
    return { text: "반복 일정의 날짜를 옮기려면 옮길 회차의 date를 주세요.", next: board };
  }

  if (result === undefined) {
    return { text: `바꿀 내용을 찾지 못했습니다: "${request.text}". 예: "3시로 바꿔", "하루 미뤄", "장소는 강남역으로"`, next: board };
  }

  const changes = result.changes.join(", ");

  if (!request.save) {
    return { text: `바꾸면: ${item.title} — ${changes}. 사용자가 확인하면 save=true로 다시 호출.`, next: board };
  }

  const edited = itemFromCard(result.card, item.id);

  // A date moved on one occurrence turned the card into a one-off: only that occurrence. Anything else: the series.
  const items = recurring && request.date !== undefined && edited.when.kind !== "recurring"
    ? editOccurrence(board.items, item, edited, request.date, "this", makeId)
    : board.items.map((i) => (i.id === item.id ? edited : i));

  const next = { ...board, items };

  await store.setMany(boardWrites(board, next));

  return { text: `바꿨습니다: ${item.title} — ${changes}`, next };
}

/** Deletes an item, or on a repeating one the occurrence on `date` ("this"), it and the following ("future"), or all. */
export async function deleteSchedule(
  store: SyncStore,
  board: Board,
  request: { id: string; date: IsoDate | undefined; scope: SeriesScope | undefined },
): Promise<Saved> {
  const item = board.items.find((i) => i.id === request.id);

  if (item === undefined) {
    return { text: NO_ITEM, next: board };
  }

  const recurring = item.when.kind === "recurring";
  const scope = request.scope ?? (recurring ? undefined : "all");

  if (scope === undefined || (scope !== "all" && request.date === undefined)) {
    return { text: "반복 일정입니다. scope(this: 그 회차만, future: 그 회차부터, all: 전체)와, all이 아니면 date를 주세요.", next: board };
  }

  if (recurring && request.date !== undefined && scope !== "all" && !occursOn(item, request.date)) {
    return { text: `그 날짜에는 이 일정이 없습니다: ${item.title} (${day(request.date)})`, next: board };
  }

  const occurrence = recurring && scope !== "all" ? request.date : undefined;

  const next = {
    ...board,
    items: occurrence === undefined ? board.items.filter((i) => i.id !== item.id) : deleteOccurrence(board.items, item, occurrence, scope),
  };

  const what = occurrence === undefined ? "" : ` (${day(occurrence)}${scope === "this" ? "만" : "부터"})`;

  await store.setMany(boardWrites(board, next));

  return { text: `삭제했습니다: ${item.title}${what}`, next };
}
