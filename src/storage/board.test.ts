import { describe, expect, test } from "vitest";
import type { Category, Item } from "../domain/item";
import type { CalendarTab } from "../domain/tabs";
import { addImported, backupJson, boardChanges, boardFromEntities, boardWrites, parseBackup, restoreBackup, restoreExactly, reuseUnchanged, type Board } from "./board";
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

    for (const change of boardChanges(empty, { ...empty, items: [{ ...mailing, id: "bad" }] })) {
      await store.set(change.entity, change.id, change.field, change.value);
    }

    await store.set("item", "bad", "title", 42);
    await store.set("category", "work", "name", "회사");
    await store.set("category", "work", "colorSlot", 1);
    await store.set("category", "work", "order", 0);

    const result = boardFromEntities(store.entities());

    expect(result.board.items).toEqual([]);
    expect(result.board.categories).toEqual([category]);
    expect(result.errors).toHaveLength(1);
  });

  test("an edit to an entity that no longer exists is skipped without a warning", async () => {
    const store = new SyncStore(new MemoryBackend(), "dev-a", () => 1_000);

    await store.set("item", "pruned", "done:2026-11-05", true);
    await store.set("category", "gone", "name", "옛 분류");

    const result = boardFromEntities(store.entities());

    expect(result.board.items).toEqual([]);
    expect(result.board.categories).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test("an item whose category is gone shows under 미분류", async () => {
    const orphan: Item = { ...mailing, id: "orphan", categoryId: "deleted-elsewhere" };
    const loaded = await roundTrip({ ...board, items: [mailing, orphan] });

    expect(loaded.items.map((item) => item.categoryId)).toEqual(["work", "uncategorized"]);
    expect(loaded.categories).toEqual([category, { id: "uncategorized", name: "미분류", colorSlot: 0 }]);
  });

  test("the 전체 tab always exists and stays first", () => {
    const result = boardFromEntities({ item: [], category: [], tab: [], settings: [] });

    expect(result.board.tabs).toEqual([allTab]);
  });
});

/** Writes what changed between two boards, as the app does on each save. */
const save = (store: SyncStore, prev: Board, next: Board) => store.setMany(boardWrites(prev, next));

/** Two devices on one folder, each with its own clock, both loaded with `board`. */
async function twoDevices() {
  const backend = new MemoryBackend();
  const a = new SyncStore(backend, "dev-a", () => 1_000);
  const b = new SyncStore(backend, "dev-b", () => 2_000);

  await a.load();
  await a.setMany(boardWrites(empty, board));
  await b.load();

  const merged = async () => {
    const reader = new SyncStore(backend, "reader", () => 9_000);

    await reader.load();

    return boardFromEntities(reader.entities()).board;
  };

  return { a, b, merged };
}

describe("saving from a board that is out of date", () => {
  test("an edit from an old board does not undo another device's newer edit of a different field", async () => {
    const { a, b, merged } = await twoDevices();
    const stale = board;

    // B renames; A, still showing the old title, ticks a date done.
    await save(b, board, { ...board, items: [{ ...mailing, title: "등기 발송" }] });
    await save(a, stale, { ...stale, items: [{ ...mailing, done: [...mailing.done, "2026-10-14"] }] });

    expect((await merged()).items).toEqual([{ ...mailing, title: "등기 발송", done: ["2026-10-07", "2026-10-14"] }]);
  });

  test("two devices ticking different days of a repeating task both count; unticking one day leaves the others", async () => {
    const { a, b, merged } = await twoDevices();

    await save(a, board, { ...board, items: [{ ...mailing, done: [...mailing.done, "2026-10-14"] }] });
    await save(b, board, { ...board, items: [{ ...mailing, done: [...mailing.done, "2026-10-21"] }] });

    expect((await merged()).items[0]?.done.toSorted()).toEqual(["2026-10-07", "2026-10-14", "2026-10-21"]);

    await save(b, board, { ...board, items: [{ ...mailing, done: [] }] });

    expect((await merged()).items[0]?.done.toSorted()).toEqual(["2026-10-14", "2026-10-21"]);
  });

  test("a new item is written with an empty done list, which versions up to 0.2.6 require; later ticks do not touch it", async () => {
    const store = new SyncStore(new MemoryBackend(), "new", () => 1_000);
    const fresh: Item = { ...mailing, done: [] };

    await save(store, empty, { ...empty, items: [fresh] });
    expect(store.entities().item[0]?.fields.done).toEqual([]);

    const writes = boardWrites({ ...empty, items: [fresh] }, { ...empty, items: [{ ...fresh, done: ["2026-10-07"] }] });

    expect(writes.map((write) => write.field)).toEqual(["done:2026-10-07"]);
  });

  test("a done list written by an older version is read, and a per-date untick overrides it", async () => {
    const store = new SyncStore(new MemoryBackend(), "old", () => 1_000);
    const { done: _done, id, ...fields } = mailing;

    for (const [field, value] of Object.entries({ ...fields, done: ["2026-10-07", "2026-10-14"] })) {
      await store.set("item", id, field, JSON.parse(JSON.stringify(value)));
    }

    const loaded = boardFromEntities(store.entities()).board;

    expect(loaded.items[0]?.done).toEqual(["2026-10-07", "2026-10-14"]);

    await store.setMany(boardWrites(loaded, { ...loaded, items: [{ ...mailing, done: ["2026-10-14"] }] }));

    expect(boardFromEntities(store.entities()).board.items[0]?.done).toEqual(["2026-10-14"]);
  });

  test("an item another device added is not removed by a save from a board that never saw it", async () => {
    const { a, b, merged } = await twoDevices();
    const added: Item = { ...mailing, id: "dentist", title: "치과", kind: "event", done: [] };

    await save(b, board, { ...board, items: [mailing, added] });
    await save(a, board, { ...board, items: [{ ...mailing, note: "등기로" }] });

    expect((await merged()).items.map((item) => item.id).toSorted()).toEqual(["dentist", "mail"]);
  });

  test("a category another device added survives a reorder saved from an old board", async () => {
    const { a, b, merged } = await twoDevices();
    const school: Category = { id: "school", name: "학교", colorSlot: 2 };
    const gym: Category = { id: "gym", name: "운동", colorSlot: 3 };

    await save(b, board, { ...board, categories: [category, school] });
    await save(a, board, { ...board, categories: [gym, category] });

    expect((await merged()).categories.map((c) => c.id).toSorted()).toEqual(["gym", "school", "work"]);
  });
});

describe("backup", () => {
  test("an exported backup reads back as the same board", () => {
    expect(parseBackup(backupJson(board, "2026-11-15T00:00:00.000Z"))).toEqual(board);
  });

  test("other files are refused: not JSON, another app's JSON, a damaged item", () => {
    const damaged = JSON.stringify({ app: "malplan", items: [{ ...mailing, kind: "meeting" }], categories: [], tabs: [] });

    expect([parseBackup("BEGIN:VCALENDAR"), parseBackup('{"items":[]}'), parseBackup(damaged)]).toEqual([undefined, undefined, undefined]);
  });

  test("restoring puts backup records back by id and keeps what the backup does not have", () => {
    const later: Item = { ...mailing, id: "later", title: "백업 뒤에 추가" };
    const school: Category = { id: "school", name: "학교", colorSlot: 2 };
    const current: Board = { items: [{ ...mailing, title: "바뀐 제목" }, later], categories: [school], tabs: [allTab] };

    expect(restoreBackup(current, board)).toEqual({ items: [mailing, later], categories: [school, category], tabs: [allTab, workTab] });
  });
});

test("완전히 되돌리기: the board becomes the backup, 전체 first even if the file lost it", () => {
  const later: Item = { ...mailing, id: "later", title: "백업 뒤에 추가" };
  const current: Board = { items: [mailing, later], categories: [category], tabs: [allTab, workTab] };
  const backup: Board = { items: [{ ...mailing, title: "예전 제목" }], categories: [category], tabs: [workTab] };

  expect(restoreExactly(backup)).toEqual({ ...backup, tabs: [allTab, workTab] });
  expect(boardChanges(current, restoreExactly(backup)).filter((change) => change.remove).map((change) => change.id)).toEqual(["later"]);
});

test("a reload keeps the objects of items that did not change, and takes the changed ones", async () => {
  const store = new SyncStore(new MemoryBackend(), "dev-a", () => 1_000);
  const other: Item = { ...mailing, id: "other", title: "다른 항목", done: [] };
  const shown: Board = { ...board, items: [mailing, other] };

  await store.setMany(boardWrites(empty, shown));
  await store.set("item", "other", "title", "바뀐 제목");

  const loaded = reuseUnchanged(shown, boardFromEntities(store.entities()).board);

  expect(loaded.items.find((item) => item.id === "mail")).toBe(mailing);
  expect(loaded.items.find((item) => item.id === "other")?.title).toBe("바뀐 제목");
});

test("imported items go to 가져옴, made once; one already here is updated and keeps its category", () => {
  const fresh: Item = { ...mailing, id: "ics-1", title: "새 일정", categoryId: "" };
  const again: Item = { ...mailing, title: "다시 가져온 제목", categoryId: "" };
  const first = addImported(board, [fresh, again], "imp");

  expect(first.categories.map((c) => c.name)).toEqual(["회사", "가져옴"]);
  expect(first.items.map((i) => [i.id, i.title, i.categoryId])).toEqual([["mail", "다시 가져온 제목", "work"], ["ics-1", "새 일정", "imp"]]);
  expect(addImported(first, [fresh], "other").categories).toHaveLength(2);
});
