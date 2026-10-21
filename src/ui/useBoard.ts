import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_TAB_ID } from "../domain/tabs";
import { deviceId, loadSyncDir, openBackend, saveSyncDir } from "../storage/backends";
import { boardChanges, boardFromEntities, type Board } from "../storage/board";
import { DELETED } from "../storage/schema";
import { SyncStore, type Backend } from "../storage/store";

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

  const show = useCallback((next: Board) => {
    current.current = next;
    setBoard(next);
  }, []);

  const write = useCallback((prev: Board, next: Board) => {
    const target = store.current;

    if (target === undefined) {
      return;
    }

    queue.current = queue.current.then(() =>
      // One append (one disk sync) per save, not one per field.
      target.setMany(
        boardChanges(prev, next).map(({ entity, id, field, value, remove }) =>
          remove ? { entity, id, field: DELETED, value: true } : { entity, id, field, value },
        ),
      ),
    ).catch((error: Error) => setErrors((list) => [...list, `저장 실패: ${error.message}`]));
  }, []);

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

      // An edit made meanwhile is not in what was read; showing it would revert the screen.
      // The next reload shows both.
      if (edits.current === editsBefore && boardChanges(current.current, loaded.board).length > 0) {
        show(loaded.board);
      }
    };

    // Focus and visibilitychange often fire together: share one reload.
    if (reloading.current !== undefined) {
      return reloading.current;
    }

    // Queued with the writes, so a write never runs while the store is reloading.
    const run = queue.current.then(async () => {
      await target.refresh();
      // Cheap unless due; the app stays open for days, so startup alone is not enough.
      await target.compactIfDue(COMPACT_THRESHOLD).catch(() => false);
    });

    queue.current = run.catch(() => undefined);
    reloading.current = run.then(apply).finally(() => {
      reloading.current = undefined;
    });

    return reloading.current;
  }, [show]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const backend = await openBackend(dir);
      const target = new SyncStore(backend, deviceId(), Date.now);

      await target.load();
      // Keep the folder small: the designated device folds logs into the snapshot now and then.
      await target.compactIfDue(COMPACT_THRESHOLD).catch(() => false);

      if (cancelled) {
        return;
      }

      store.current = target;

      const loaded = boardFromEntities(target.entities());

      setErrors([...target.errors, ...loaded.errors]);

      const isNew = loaded.board.items.length === 0 && loaded.board.categories.length === 0;

      if (isNew) {
        const seeded = seedRef.current();

        show(seeded);
        write(EMPTY, seeded);
      } else {
        show(loaded.board);
      }

      setReady(true);
    })().catch((error: Error) => setErrors([`불러오기 실패: ${error.message}`]));

    return () => {
      cancelled = true;
    };
  }, [dir, show, write]);

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

  return { board, ready, errors, update, dir, switchFolder, reload };
}

/** Folder holds sync data already? Used to ask merge vs replace. */
export async function folderHasData(dir: string | undefined): Promise<boolean> {
  const backend = await openBackend(dir);

  return (await backend.list()).some((name) => name === "snapshot.json" || name.startsWith("log-"));
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

async function copyInto(from: Backend, to: Backend): Promise<void> {
  const existing = new Set(await to.list());

  for (const name of await from.list()) {
    const text = (await from.read(name)) ?? "";

    if (!existing.has(name)) {
      await to.write(name, text);
    } else if (name.startsWith("log-")) {
      await to.append(name, text);
    }
  }
}
