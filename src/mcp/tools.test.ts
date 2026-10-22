import { describe, expect, test } from "vitest";
import { boardWrites, type Board } from "../storage/board";
import { MemoryBackend, SyncStore } from "../storage/store";
import { addSchedule, completeTask, findSchedule, listSchedule, loadBoard, previewSchedule } from "./tools";

// 2026-10-05 is a Monday.
const today = "2026-10-05";

const empty: Board = { items: [], categories: [{ id: "work", name: "회사", colorSlot: 1 }], tabs: [] };

async function seeded(): Promise<{ store: SyncStore; board: Board; backend: MemoryBackend }> {
  const backend = new MemoryBackend();
  const app = new SyncStore(backend, "app", () => 1);

  await app.load();
  await app.setMany(boardWrites({ items: [], categories: [], tabs: [] }, empty));

  let clock = 100;
  const store = new SyncStore(backend, "mcp", () => clock++);

  return { store, board: await loadBoard(store), backend };
}

describe("mcp tools", () => {
  test("preview reads dates with the app's parser and saves nothing", async () => {
    const { store, board, backend } = await seeded();

    expect(previewSchedule(board, "내일 오후 3시 회사 회의", today)).toBe("저장하면: 회사 회의 · 10/6(화) · 15시 · 회사 · 일정");
    expect(previewSchedule(board, "", today)).toMatch(/^저장할 수 없습니다/);
    expect([...backend.files.keys()]).not.toContain("log-mcp.jsonl");
    expect(store.errors).toEqual([]);
  });

  test("add writes to the server's own log, and the app sees it on its next load", async () => {
    const { store, board, backend } = await seeded();
    const saved = await addSchedule(store, board, "금요일까지 보고서 제출", today, () => "t1");

    expect(saved.text).toBe("저장했습니다: 보고서 제출 · 10/9(금) · 아무때나 · 회사 · 할 일 id=t1");
    expect([...backend.files.keys()]).toContain("log-mcp.jsonl");

    const app = await loadBoard(new SyncStore(backend, "app", () => 999));

    expect(app.items.map((i) => i.title)).toEqual(["보고서 제출"]);
  });

  test("list, find and complete", async () => {
    const { store, board } = await seeded();
    const { next } = await addSchedule(store, board, "수요일까지 보고서 제출", today, () => "t1");

    expect(listSchedule(next, today, 7)).toContain("10/7(수)\n  - 아무때나 보고서 제출 [회사] (할 일) id=t1");
    expect(listSchedule(next, "2026-11-01", 3)).toBe("11/1(일)부터 3일 동안 일정이 없습니다.");
    expect(findSchedule(next, "보고서", today)).toContain("id=t1");

    const done = await completeTask(store, next, "t1", undefined);

    expect(done.text).toBe("완료했습니다: 보고서 제출 (10/7(수))");
    expect(listSchedule(done.next, today, 7)).toContain("(완료)");
    expect((await completeTask(store, done.next, "nope", undefined)).text).toMatch(/^그 id의 할 일이 없습니다/);
  });
});
