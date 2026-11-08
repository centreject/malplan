import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_TAB_ID } from "../domain/tabs";
import { deviceId, loadSyncDir, openBackend, saveSyncDir } from "../storage/backends";
import { boardChanges, boardFromEntities, boardWrites, type Board } from "../storage/board";
import { copyInto, Outbox, SyncStore } from "../storage/store";
import { report } from "./report";

const EMPTY: Board = { items: [], categories: [], tabs: [{ id: ALL_TAB_ID, name: "전체", categoryIds: undefined }] };

/** How often other devices' changes are picked up while the window is open. */
const REFRESH_MS = 60_000;

/** Pending log entries (all devices) before the designated device compacts on startup. */
const COMPACT_THRESHOLD = 2000;

export type FolderMode = "merge" | "replace";

/**
 * The board, persisted through the sync store. Each update writes only the changed fields to
 * this device's log; other devices' logs are re-read every minute and when the window regains focus.
 */
export function useBoard(seed: () => Board) {
  const [board, setBoard] = useState<Board>(EMPTY);
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [dir, setDir] = useState(loadSyncDir);
  const current = useRef(EMPTY);
  const store = useRef<SyncStore>(undefined);
  /** Writes run one after another, in order. */
  const queue = useRef<Promise<void>>(Promise.resolve());
  /** Only used on first run; held in a ref so a new function identity never re-seeds. */
  const seedRef = useRef(seed);
  /** Counts local edits, so a reload that overlapped one does not overwrite the screen. */
  const edits = useRef(0);
  const reloading = useRef<Promise<void>>(undefined);
  const outbox = useRef(new Outbox());
  const [unsaved, setUnsaved] = useState(0);
  /** Bumped to retry a failed load (an offline NAS, a locked file). */
  const [attempt, setAttempt] = useState(0);

  const show = useCallback((next: Board) => {
    current.current = next;
    setBoard(next);
  }, []);

  /** Sends what waits in the outbox. A failure keeps it there for the next save, reload or load: nothing is dropped. */
  const flush = useCallback(async (target: SyncStore | undefined) => {
    try {
      // One append (one disk sync) per flush, not one per field.
      await outbox.current.flush(target);
    } catch (error) {
      report(`save failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    setUnsaved(outbox.current.size);
  }, []);

  /** Queues the change; it is written once the store is ready (still loading, a failed load, or a folder switch). */
  const write = useCallback(
    (prev: Board, next: Board) => {
      outbox.current.add(boardWrites(prev, next));
      queue.current = queue.current.then(() => flush(store.current));
    },
    [flush],
  );

  const update = useCallback(
    (change: (board: Board) => Board) => {
      const prev = current.current;
      const next = change(prev);

      edits.current += 1;
      show(next);
      write(prev, next);
    },
    [show, write],
  );

  const reload = useCallback((): Promise<void> => {
    const target = store.current;

    if (target === undefined) {
      return Promise.resolve();
    }

    const editsBefore = edits.current;

    const apply = () => {
      const loaded = boardFromEntities(target.entities());
      const found = [...target.errors, ...loaded.errors];

      setErrors((list) => (sameList(list, found) ? list : found));

      // An edit made meanwhile, or one still waiting to be saved, is not in what was read; showing it
      // would revert the screen. The next reload shows both.
      if (edits.current === editsBefore && outbox.current.size === 0 && boardChanges(current.current, loaded.board).length > 0) {
        show(loaded.board);
      }
    };

    // Focus and visibilitychange often fire together: share one reload.
    if (reloading.current !== undefined) {
      return reloading.current;
    }

    // Queued with the writes, so a write never runs while the store is reloading.
    const run = queue.current.then(async () => {
      await flush(target);
      await target.refresh();
      // Cheap unless due; the app stays open for days, so startup alone is not enough.
      await target.compactIfDue(COMPACT_THRESHOLD).catch(() => false);
    });

    queue.current = run.catch(() => undefined);
    reloading.current = run.then(apply).finally(() => {
      reloading.current = undefined;
    });

    return reloading.current;
  }, [show, flush]);

  useEffect(() => {
    let cancelled = false;
    let retry: number | undefined;

    void (async () => {
      if (attempt > 0) {
        report(`load retry ${attempt}`);
      }

      const backend = await openBackend(dir);
      const target = new SyncStore(backend, deviceId(), Date.now);

      await target.load();
      // Keep the folder small: the designated device folds logs into the snapshot now and then.
      await target.compactIfDue(COMPACT_THRESHOLD).catch(() => false);

      if (cancelled) {
        return;
      }

      store.current = target;
      // Edits made before the store was ready go out first, so the board read next includes them.
      queue.current = queue.current.then(() => flush(target));
      await queue.current;

      const loaded = boardFromEntities(target.entities());

      setErrors([...target.errors, ...loaded.errors]);

      const isNew = loaded.board.items.length === 0 && loaded.board.categories.length === 0;

      if (isNew) {
        const seeded = seedRef.current();

        show(seeded);
        await target.seed(boardWrites(EMPTY, seeded));
      } else {
        show(loaded.board);
      }

      setReady(true);
    })().catch((error: Error) => {
      report(`load failed: ${error.message}`);
      setErrors([`불러오기 실패: ${error.message}. 잠시 뒤 다시 시도합니다.`]);

      if (!cancelled) {
        retry = window.setTimeout(() => setAttempt((n) => n + 1), REFRESH_MS);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(retry);
    };
  }, [dir, attempt, show, flush]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    // A hidden window (tray) skips the minute refresh and catches up when shown again.
    const onShow = () => {
      if (!document.hidden) void reload();
    };

    const timer = window.setInterval(onShow, REFRESH_MS);

    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [ready, reload]);

  /**
   * Switch to another sync folder. "merge" copies this device's data into it first (log lines are
   * idempotent, so overlapping copies are harmless); "replace" just uses what the folder holds.
   */
  const switchFolder = useCallback(
    async (next: string | undefined, mode: FolderMode) => {
      await queue.current;

      if (mode === "merge") {
        const from = await openBackend(dir);
        const to = await openBackend(next);

        await copyInto(from, to);
      }

      saveSyncDir(next);
      setReady(false);
      store.current = undefined;
      setDir(next);
    },
    [dir],
  );

  const shownErrors = unsaved === 0 ? errors : [...errors, `저장하지 못한 변경 ${unsaved}건: 폴더에 다시 쓸 수 있으면 저장합니다.`];

  return { board, ready, errors: shownErrors, update, dir, switchFolder, reload };
}

/** Folder holds sync data already? Used to ask merge vs replace. */
export async function folderHasData(dir: string | undefined): Promise<boolean> {
  const backend = await openBackend(dir);

  return (await backend.list()).some((name) => name === "snapshot.json" || name.startsWith("log-"));
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}
