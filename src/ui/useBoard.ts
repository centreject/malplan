import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { ALL_TAB_ID } from "../domain/tabs";
import { deviceId, loadSyncDir, openBackend, saveSyncDir } from "../storage/backends";
import { connectDrive, disconnectDrive, forgetDriveSync, savedDriveLink, type DriveLink } from "../storage/driveLink";
import { GOOGLE_CLIENT } from "../storage/googleAuth";
import { boardChanges, boardFromEntities, boardWrites, reuseUnchanged, type Board } from "../storage/board";
import * as v from "valibot";
import { loadStored, saveStored } from "../storage/localStore";
import { EntityKindSchema, JsonSchema } from "../storage/schema";
import { copyInto, Outbox, SyncStore, type Backend } from "../storage/store";
import { report } from "./report";

const EMPTY: Board = { items: [], categories: [], tabs: [{ id: ALL_TAB_ID, name: "전체", categoryIds: undefined }] };

/** How often other devices' changes are picked up while the window is open. */
const REFRESH_MS = 60_000;

const PENDING_KEY = "malplan.pendingWrites";

/** After an edit, Drive is brought up to date this much later: a burst of edits goes up in one round. */
const DRIVE_AFTER_EDIT_MS = 5_000;

const PendingSchema = v.array(
  v.object({ entity: EntityKindSchema, id: v.string(), field: v.string(), value: JsonSchema, at: v.exactOptional(v.number()) }),
);

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
  // What waits is also kept in this device's own storage: a change that could not be saved before the app quit
  // (a locked or offline folder) is saved by the next run.
  const [outbox] = useState(() => new Outbox(loadStored(PENDING_KEY, PendingSchema, []), (waiting) => saveStored(PENDING_KEY, waiting)));
  const [unsaved, setUnsaved] = useState(outbox.size);
  /** Bumped to retry a failed load (an offline NAS, a locked file). */
  const [attempt, setAttempt] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  /** The folder the store reads; Drive rounds copy files in and out of it. */
  const backend = useRef<Backend>(undefined);
  const [drive, setDrive] = useState<DriveLink>();
  const driveRef = useRef<DriveLink>(undefined);
  /** The last Drive round's failure, or undefined after a round that worked. */
  const [driveNote, setDriveNote] = useState<string>();
  /** Bumped by every edit: what the Drive push waits on. */
  const [editsToSend, setEditsToSend] = useState(0);

  const show = useCallback((next: Board) => {
    current.current = next;
    setBoard(next);
  }, []);

  /** Sends what waits in the outbox. A failure keeps it there for the next save, reload or load: nothing is dropped. */
  const flush = useCallback(async (target: SyncStore | undefined) => {
    try {
      // One append (one disk sync) per flush, not one per field.
      await outbox.flush(target);
    } catch (error) {
      report(`save failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    setUnsaved(outbox.size);
  }, [outbox]);

  /** Queues the change; it is written once the store is ready (still loading, a failed load, or a folder switch). */
  const write = useCallback(
    (prev: Board, next: Board) => {
      outbox.add(boardWrites(prev, next), Date.now());
      queue.current = queue.current.then(() => flush(store.current));
      setEditsToSend((n) => n + 1);
    },
    [flush, outbox],
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
      if (edits.current === editsBefore && outbox.size === 0 && boardChanges(current.current, loaded.board).length > 0) {
        show(reuseUnchanged(current.current, loaded.board));
      }
    };

    // Focus and visibilitychange often fire together: share one reload.
    if (reloading.current !== undefined) {
      return reloading.current;
    }

    // Queued with the writes, so a write never runs while the store is reloading.
    const run = queue.current.then(async () => {
      await flush(target);

      // Drive first, so the refresh reads what came down. Offline or signed out at Google: the folder still works.
      if (driveRef.current !== undefined && backend.current !== undefined) {
        try {
          await driveRef.current.round(backend.current);
          setDriveNote(undefined);
        } catch (error) {
          report(`drive sync failed: ${errorText(error instanceof Error ? error : String(error))}`);
          setDriveNote("Google Drive와 맞추지 못했습니다. 인터넷 연결을 확인하세요. 이 PC에는 그대로 저장됩니다.");
        }
      }

      await target.refresh();
      // Cheap unless due; the app stays open for days, so startup alone is not enough.
      await target.compactIfDue(COMPACT_THRESHOLD).catch(() => false);
    });

    queue.current = run.catch(() => undefined);

    // A failed read (an offline NAS, a locked file) shows on the main screen until a later reload succeeds.
    const settle = run.then(
      () => {
        setLoadFailed(false);
        apply();
      },
      (error: Error | string) => {
        report(`reload failed: ${errorText(error)}`);
        setLoadFailed(true);
      },
    );

    reloading.current = settle.finally(() => {
      reloading.current = undefined;
    });

    return reloading.current;
  }, [show, flush, outbox]);

  // Edits go up to Drive a little after the last one of a burst.
  useEffect(() => {
    if (drive === undefined || editsToSend === 0) {
      return;
    }

    const timer = window.setTimeout(() => void reload(), DRIVE_AFTER_EDIT_MS);

    return () => window.clearTimeout(timer);
  }, [drive, editsToSend, reload]);

  useEffect(() => {
    let cancelled = false;
    let retry: number | undefined;

    void (async () => {
      if (attempt > 0) {
        report(`load retry ${attempt}`);
      }

      const opened = await openBackend(dir);
      const target = new SyncStore(opened, deviceId(), Date.now);

      await target.load();
      // Keep the folder small: the designated device folds logs into the snapshot now and then.
      await target.compactIfDue(COMPACT_THRESHOLD).catch(() => false);

      if (cancelled) {
        return;
      }

      store.current = target;
      backend.current = opened;
      // Edits made before the store was ready go out first, so the board read next includes them.
      queue.current = queue.current.then(() => flush(target));
      await queue.current;

      // A folder with no categories stored is new, even if an item typed before the load was saved first.
      if (target.entities().category.length === 0) {
        await target.seed(boardWrites(EMPTY, seedRef.current()));
      }

      // Switched to another folder meanwhile: that load shows its own board.
      if (cancelled) {
        return;
      }

      const loaded = boardFromEntities(target.entities());

      setErrors([...target.errors, ...loaded.errors]);
      show(loaded.board);
      setLoadFailed(false);
      setReady(true);
    })().catch((error: Error | string) => {
      report(`load failed: ${errorText(error)}`);
      setErrors([`불러오기 실패: ${errorText(error)}. 잠시 뒤 다시 시도합니다.`]);
      setLoadFailed(true);

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

  // A connection made before signs in again without asking.
  useEffect(() => {
    if (GOOGLE_CLIENT === undefined || !isTauri()) {
      return;
    }

    void savedDriveLink(GOOGLE_CLIENT, deviceId()).then((saved) => {
      driveRef.current = saved;
      setDrive(saved);
    }, (error: Error | string) => report(`drive token read failed: ${errorText(error)}`));
  }, []);

  // Connected (now, or at start): bring the folder up to date with Drive at once.
  useEffect(() => {
    if (ready && drive !== undefined) {
      void reload();
    }
  }, [ready, drive, reload]);

  const connect = useCallback(async () => {
    if (GOOGLE_CLIENT === undefined) {
      return;
    }

    const made = await connectDrive(GOOGLE_CLIENT, deviceId());

    driveRef.current = made;
    setDrive(made);
  }, []);

  const disconnect = useCallback(async () => {
    driveRef.current = undefined;
    setDrive(undefined);
    setDriveNote(undefined);
    await disconnectDrive();
  }, []);

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
      forgetDriveSync();
      setReady(false);
      store.current = undefined;
      backend.current = undefined;
      setDir(next);
    },
    [dir],
  );

  const unsavedText = `저장하지 못한 변경 ${unsaved}건: 폴더에 다시 쓸 수 있으면 저장합니다.`;
  const shownErrors = unsaved === 0 ? errors : [...errors, unsavedText];
  /** Shown on the main screen too: data is not where the user thinks it is. */
  const warning = unsaved > 0 ? unsavedText : loadFailed ? "저장 폴더를 불러오지 못했습니다. 잠시 뒤 다시 시도합니다." : undefined;

  const driveState = { available: GOOGLE_CLIENT !== undefined && isTauri(), connected: drive !== undefined, note: driveNote, connect, disconnect };

  return { board, ready, errors: shownErrors, warning, unsaved, update, dir, switchFolder, reload, drive: driveState };
}

/** Folder holds sync data already? Used to ask merge vs replace. */
export async function folderHasData(dir: string | undefined): Promise<boolean> {
  const backend = await openBackend(dir);

  return (await backend.list()).some((name) => name === "snapshot.json" || (name.startsWith("log-") && name.endsWith(".jsonl")));
}

/** Tauri commands reject with the Rust error string, not an Error. */
function errorText(error: Error | string): string {
  return error instanceof Error ? error.message : error;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}
