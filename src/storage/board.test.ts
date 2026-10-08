import { describe, expect, test } from "vitest";
import type { Category, Item } from "../domain/item";
import type { CalendarTab } from "../domain/tabs";
import { boardChanges, boardFromEntities, type Board } from "./board";
import { MemoryBackend, SyncStore } from "./store";

const category: Category = { id: "work", name: "회사", colorSlot: 1 };

const mailing: Item = {
  id: "mail",
  title: "회사 우편물 발송",
  kind: "task",
  categoryId: "work",
  when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-10-05", until: "2026-12-28" } },
  time: { kind: "exact", start: { hour: 16, minute: 0 } },
  done: ["2026-10-07"],
  place: "우체국",
  remindMinutes: 10,
};

const allTab: CalendarTab = { id: "all", name: "전체", categoryIds: undefined };

const workTab: CalendarTab = { id: "t-work", name: "회사", categoryIds: ["work"] };

const board: Board = { items: [mailing], categories: [category], tabs: [allTab, workTab] };

const empty: Board = { items: [], categories: [], tabs: [] };

async function roundTrip(next: Board, prev: Board = empty): Promise<Board> {
  const store = new SyncStore(new MemoryBackend(), "dev-a", () => 1_000);

  for (const change of boardChanges(prev, next)) {
    if (change.remove) {
      await store.remove(change.entity, change.id);
    } else {
      await store.set(change.entity, change.id, change.field, change.value);
    }
  }

  return boardFromEntities(store.entities()).board;
}

test("a board survives a round trip through the sync store", async () => {
  expect(await roundTrip(board)).toEqual(board);
});

test("tab and category order is kept", async () => {
  const reordered: Board = { ...board, tabs: [allTab, { ...workTab, id: "t-2", name: "탭 2" }, workTab] };

  expect((await roundTrip(reordered)).tabs.map((t) => t.id)).toEqual(["all", "t-2", "t-work"]);
});

describe("boardChanges", () => {
  test("no changes for an identical board", () => {
    expect(boardChanges(board, structuredClone(board))).toEqual([]);
  });

  test("only the edited field is written", () => {
    const next: Board = { ...board, items: [{ ...mailing, title: "우편물" }] };

    expect(boardChanges(board, next)).toEqual([
      { entity: "item", id: "mail", field: "title", value: "우편물", remove: false },
    ]);
  });

  test("a cleared optional field is written as null", () => {
    const { place: _place, ...withoutPlace } = mailing;
    const next: Board = { ...board, items: [withoutPlace] };

    expect(boardChanges(board, next)).toEqual([
      { entity: "item", id: "mail", field: "place", value: null, remove: false },
    ]);
  });

  test("a removed entity becomes a remove change", () => {
    const next: Board = { ...board, items: [] };

    expect(boardChanges(board, next)).toEqual([{ entity: "item", id: "mail", field: "", value: null, remove: true }]);
  });

  test("moving a tab rewrites order fields only", () => {
    const next: Board = { ...board, tabs: [workTab, allTab] };

    expect(boardChanges(board, next).map((c) => `${c.id}.${c.field}`).toSorted()).toEqual(["all.order", "t-work.order"]);
  });
});

describe("boardFromEntities", () => {
  test("invalid records are skipped and reported", async () => {
    const store = new SyncStore(new MemoryBackend(), "dev-a", () => 1_000);

    await store.set("item", "bad", "title", 42);
    await store.set("category", "work", "name", "회사");
    await store.set("category", "work", "colorSlot", 1);
    await store.set("category", "work", "order", 0);

    const result = boardFromEntities(store.entities());

    expect(result.board.items).toEqual([]);
    expect(result.board.categories).toEqual([category]);
    expect(result.errors).toHaveLength(1);
  });

  test("the 전체 tab always exists and stays first", () => {
    const result = boardFromEntities({ item: [], category: [], tab: [], settings: [] });

    expect(result.board.tabs).toEqual([allTab]);
  });
});
