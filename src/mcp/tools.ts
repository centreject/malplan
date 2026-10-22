// What the malplan MCP server can do, over a sync store. No MCP or Node here, so it runs in tests.
// Dates are always read by the app's own parser from a Korean sentence: the calling model never computes them.
import { cardErrors, cardFromParse, commitCards, type Card } from "../domain/card";
import { addDays, weekdayOf, type IsoDate } from "../domain/date";
import { WEEKDAY_NAMES, recurrenceLabel, shortDate } from "../domain/format";
import type { Category, Item } from "../domain/item";
import { occurrencesOn } from "../domain/schedule";
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
  const results = searchItems(board.items, query, today);

  return results.length === 0
    ? `"${query}"에 맞는 일정이 없습니다.`
    : results.map(({ item, date }) => `- ${describe(item, board.categories)}${date === undefined ? "" : ` (다음: ${day(date)})`} id=${item.id}`).join("\n");
}

type ParsedSentence = { card: Card; problems: string[] };

function cardOf(board: Board, sentence: string, today: IsoDate): ParsedSentence {
  const card = cardFromParse(parseKorean(sentence, today), today, board.categories);

  return { card, problems: Object.values(cardErrors(card)) };
}

/** What add_schedule would save, without saving. */
export function previewSchedule(board: Board, sentence: string, today: IsoDate): string {
  const { card, problems } = cardOf(board, sentence, today);

  if (problems.length > 0) {
    return `저장할 수 없습니다: ${problems.join(" ")}`;
  }

  const { items, categories } = commitCards([{ id: "preview", card }], [], board.categories, () => "preview");
  const item = items[0];

  return item === undefined ? "읽을 수 없는 문장입니다." : `저장하면: ${describe(item, categories)}`;
}

export type Saved = { text: string; next: Board };

/** Saves the sentence as the app's confirm screen would with no edits. */
export async function addSchedule(store: SyncStore, board: Board, sentence: string, today: IsoDate, makeId: () => string): Promise<Saved> {
  const { card, problems } = cardOf(board, sentence, today);

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

  const key = item.when.kind === "single" ? item.when.date : item.when.kind === "range" ? item.when.end : item.when.kind === "none" ? "done" : date;

  if (key === undefined) {
    return { text: "반복 할 일은 완료할 날짜(date)가 필요합니다.", next: board };
  }

  if (item.done.includes(key)) {
    return { text: `이미 완료된 할 일입니다: ${item.title}`, next: board };
  }

  const next = { ...board, items: board.items.map((i) => (i.id === id ? { ...i, done: [...i.done, key] } : i)) };

  await store.setMany(boardWrites(board, next));

  return { text: `완료했습니다: ${item.title}${key === "done" ? "" : ` (${day(key)})`}`, next };
}
