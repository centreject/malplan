import { compact, loadState } from "./compact";
import { applyChanges, emptyState, materialize, type Entities, type State } from "./merge";
import { DELETED, emptySnapshot, parseLog, parseSnapshot, type Change, type EntityKind, type Json, type ParsedSnapshot, type Snapshot } from "./schema";

/** A folder of sync files: local, NAS or Drive appData. */
export interface Backend {
  list(): Promise<string[]>;
  read(name: string): Promise<string | undefined>;
  write(name: string, content: string): Promise<void>;
  append(name: string, line: string): Promise<void>;
  /** Text that changes whenever any file in the folder does (names, sizes, times). Without it, refresh always reads. */
  stamp?(): Promise<string>;
}

export class MemoryBackend implements Backend {
  readonly files = new Map<string, string>();

  async list() {
    return [...this.files.keys()];
  }

  async read(name: string) {
    return this.files.get(name);
  }

  async write(name: string, content: string) {
    this.files.set(name, content);
  }

  async append(name: string, line: string) {
    this.files.set(name, (this.files.get(name) ?? "") + line);
  }
}

/** `at`: when the edit was made, if it is written later (a save retried after a failure, or after a restart). */
export type FieldWrite = Pick<Change, "entity" | "id" | "field" | "value"> & { at?: number };

const SNAPSHOT = "snapshot.json";

/**
 * Any log file, including a cloud client's copy of one ("log-a (1).jsonl", "log-a-DESKTOP.jsonl"): its lines are
 * read by the device each line names, so a copy adds what only it holds and never becomes a device of its own.
 */
const isLogFile = (name: string) => name.startsWith("log-") && name.endsWith(".jsonl");

/** A device's own log, as this app names it. */
const OWN_LOG_NAME = /^log-[\w.-]+\.jsonl$/;

const isSyncFile = (name: string) => name === SNAPSHOT || isLogFile(name);

/** The files a device's own data lives in: the snapshot and the logs as this app names them (not a cloud copy). */
export const isOwnSyncFile = (name: string) => name === SNAPSHOT || OWN_LOG_NAME.test(name);

/** Only devices that wrote within this time may be the compactor: one that left (a replaced PC) would block it. */
const ACTIVE_WITHIN_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * First-run defaults are dated 1, 2, 3… instead of now (there are far fewer than 1000 of them, and real
 * clocks are far above it), so any real edit wins over them and a merge into a folder with data leaves them out.
 */
const DEFAULTS_BEFORE = 1000;

const isReal = (change: Change) => change.ts >= DEFAULTS_BEFORE;

/** How long a device keeps its own folded log entries before pruning them. */
export const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * With no snapshot in sight, a device compacts only once its own entries are this old. A device that just joined
 * a cloud folder may have received the logs but not yet snapshot.json; a snapshot built from logs alone would
 * replace the real one and drop everything only that one held.
 */
const FIRST_COMPACT_AFTER_MS = 24 * 60 * 60 * 1000;

export const logName = (device: string) => `log-${device}.jsonl`;

const toLines = (changes: readonly Change[]) => changes.map((c) => `${JSON.stringify(c)}\n`).join("");

/**
 * Each device appends only to its own log and reads everyone else's.
 *
 * Compaction is run by one designated device. It rewrites snapshot.json; no log is truncated
 * there. Logs keep entries already folded in, and load() skips them because
 * their ts <= snapshot.seen[device]. Each device later prunes those entries from its own log.
 * Two devices compacting at once (a cloud folder syncing late) both fold; whichever snapshot wins, entries
 * only the other one held are still in their device's log, which is pruned only after PRUNE_AFTER_MS.
 */
export class SyncStore {
  /** Problems found by the last load: corrupt lines or a corrupt snapshot. Bad data is skipped. */
  errors: string[] = [];

  readonly #backend: Backend;
  readonly #deviceId: string;
  readonly #now: () => number;
  #snapshot: Snapshot = emptySnapshot();
  /** The last read found snapshot.json corrupt, or gone after an earlier read had it: no compaction, no pruning. */
  #snapshotUnreadable = false;
  #logs = new Map<string, Change[]>();
  #state: State = emptyState;
  #lastTs = -Infinity;
  /** The folder's stamp when the last refresh read it; undefined after any other load. */
  #stamp: string | undefined;

  constructor(backend: Backend, deviceId: string, now: () => number) {
    this.#backend = backend;
    this.#deviceId = deviceId;
    this.#now = now;
  }

  /** Reads the snapshot and every log, and merges them. */
  async load(): Promise<void> {
    this.#stamp = undefined;

    const errors: string[] = [];
    const snapshotText = await this.#backend.read(SNAPSHOT);
    const parsed: ParsedSnapshot = snapshotText === undefined ? { snapshot: emptySnapshot() } : parseSnapshot(snapshotText);
    const hadSnapshot = this.#snapshot.compactedAt > 0;
    const vanished = snapshotText === undefined && hadSnapshot;

    if (parsed.error !== undefined) errors.push(`${SNAPSHOT}: ${parsed.error}`);

    if (vanished) errors.push(`${SNAPSHOT}: 파일이 보이지 않습니다. 마지막으로 읽은 내용을 유지합니다.`);

    const unreadable = parsed.error !== undefined || vanished;
    // A cloud client replacing the file leaves it missing or half-written for a moment. The snapshot read before
    // still holds everything it folded; showing the board without it would make items vanish until the next read.
    const snapshot = unreadable && hadSnapshot ? this.#snapshot : parsed.snapshot;

    const files = new Map<string, Change[]>();
    const logs = await readLogs(this.#backend, errors, files);

    this.errors = errors;
    this.#snapshot = snapshot;
    this.#snapshotUnreadable = unreadable;
    this.#logs = logs;
    this.#state = loadState(snapshot, [...logs.values()].flat());

    const seenSelf = new Map(Object.entries(snapshot.seen)).get(this.#deviceId) ?? -Infinity;
    const own = logs.get(this.#deviceId) ?? [];
    // Folded entries stay until the snapshot that folded them is PRUNE_AFTER_MS old: if another device compacted at
    // the same time and its snapshot wins (a cloud folder syncing late), entries only ours held are still in our log.
    // Measured from the compaction, not the entry: the first compaction folds mostly old entries.
    const settled = !unreadable && this.#now() - snapshot.compactedAt > PRUNE_AFTER_MS;
    const live = own.filter((c) => c.ts > seenSelf || !settled);

    for (const c of own) this.#lastTs = Math.max(this.#lastTs, c.ts);

    this.#lastTs = Math.max(this.#lastTs, seenSelf);

    // Only when our own file holds a line to prune. A cloud copy of it may hold folded lines too, but we never
    // write the copy, so comparing against everything read would rewrite our log on every load.
    const kept = new Set(live.map((c) => c.ts));

    if ((files.get(logName(this.#deviceId)) ?? []).some((c) => !kept.has(c.ts))) {
      await this.#backend.write(logName(this.#deviceId), toLines(live));
      logs.set(this.#deviceId, live);
    }
  }

  /**
   * Re-reads other devices' files (and a snapshot another device may have written), unless nothing in the folder
   * changed since the last refresh. Our own writes change it too, so the read after them is not skipped.
   */
  async refresh(): Promise<void> {
    const stamp = await this.#backend.stamp?.().catch(() => undefined);

    if (stamp !== undefined && stamp === this.#stamp) return;

    await this.load();
    this.#stamp = stamp;
  }

  set(entity: EntityKind, id: string, field: string, value: Json): Promise<void> {
    return this.setMany([{ entity, id, field, value }]);
  }

  /** Writes several fields in one append (one disk sync). Use DELETED/true to remove an entity. */
  setMany(writes: readonly FieldWrite[]): Promise<void> {
    return this.#append(writes, this.#now());
  }

  /** First-run defaults (fixed ids such as the starter categories), dated so that they never override real data. */
  seed(writes: readonly FieldWrite[]): Promise<void> {
    return this.#append(writes, 1);
  }

  async #append(writes: readonly FieldWrite[], now: number): Promise<void> {
    if (writes.length === 0) return;

    let ts = this.#lastTs;

    // Strictly increasing per device, even if the clock steps back: compaction relies on it.
    // A write that waited (`at`) is dated when it was made, not when it got through: merging goes by edit time.
    const changes = writes.map(({ entity, id, field, value, at }): Change => {
      ts = Math.max(at ?? now, ts + 1);

      return { ts, device: this.#deviceId, entity, id, field, value };
    });

    await this.#backend.append(logName(this.#deviceId), toLines(changes));
    this.#lastTs = ts;
    this.#state = applyChanges(this.#state, changes);
    this.#logs.set(this.#deviceId, [...(this.#logs.get(this.#deviceId) ?? []), ...changes]);
  }

  remove(entity: EntityKind, id: string): Promise<void> {
    return this.set(entity, id, DELETED, true);
  }

  /** Folds everything into snapshot.json. Run on one designated device only (see class comment). */
  async compact(): Promise<void> {
    await this.load();

    if (this.#snapshotUnreadable) throw new Error(`${SNAPSHOT} is corrupt or missing; refusing to overwrite it`);

    const known = [...new Set([...this.#logs.keys(), this.#deviceId])];
    const result = compact(this.#snapshot, this.#logs, this.#now(), known);

    // Our own log is pruned by load(), past PRUNE_AFTER_MS, not here: see there.
    await this.#backend.write(SNAPSHOT, JSON.stringify(result.snapshot));
    await this.load();
  }

  /**
   * Compact when the logs hold more than `threshold` changes, but only on the designated
   * compactor: the device with the smallest id among those that wrote here in the last 30 days. Returns whether it ran.
   * Decides from the last load() plus this device's writes since, so it is cheap when not due.
   */
  async compactIfDue(threshold: number): Promise<boolean> {
    const seen = new Map(Object.entries(this.#snapshot.seen));
    const lastWrite = (device: string) => Math.max(seen.get(device) ?? -Infinity, ...(this.#logs.get(device) ?? []).map((c) => c.ts));
    const active = (device: string) => device === this.#deviceId || lastWrite(device) > this.#now() - ACTIVE_WITHIN_MS;
    const devices = [...new Set([...this.#logs.keys(), this.#deviceId])].filter(active).toSorted();
    // Entries already folded but kept for a while (PRUNE_AFTER_MS) are not pending.
    const pending = [...this.#logs.values()].flat().filter((c) => c.ts > (seen.get(c.device) ?? -Infinity)).length;

    if (devices[0] !== this.#deviceId || pending <= threshold || this.#snapshotUnreadable) {
      return false;
    }

    // No snapshot in sight: only a device that has been writing here for a while may make the first one.
    const firstOwn = (this.#logs.get(this.#deviceId) ?? []).find(isReal);

    if (this.#snapshot.compactedAt === 0 && (firstOwn === undefined || this.#now() - firstOwn.ts < FIRST_COMPACT_AFTER_MS)) {
      return false;
    }

    await this.compact();

    return true;
  }

  entities(): Entities {
    return materialize(this.#state);
  }
}

/**
 * Every log file's lines, grouped by the device each line names. A device's lines can come from several files
 * (its log and a cloud copy of it): each ts is kept once, in order. A copy that cannot be read is reported and
 * skipped; a device's own log failing to read still fails the load. `files` gets each file's own lines.
 */
async function readLogs(backend: Backend, errors: string[], files = new Map<string, Change[]>()): Promise<Map<string, Change[]>> {
  const logs = new Map<string, Change[]>();

  for (const name of (await backend.list()).filter(isLogFile)) {
    let text: string;

    try {
      text = (await backend.read(name)) ?? "";
    } catch (error) {
      if (OWN_LOG_NAME.test(name)) throw error;

      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    const log = parseLog(text);

    errors.push(...log.errors.map((e) => `${name} ${e}`));
    files.set(name, log.changes);

    for (const change of log.changes) logs.set(change.device, [...(logs.get(change.device) ?? []), change]);
  }

  for (const [device, changes] of logs) {
    const byTs = new Map(changes.map((change) => [change.ts, change]));

    logs.set(device, [...byTs.values()].toSorted((a, b) => a.ts - b.ts));
  }

  return logs;
}

/**
 * Copies one sync folder's data into another ("merge" when switching folders). Only sync files are read.
 *
 * Into an empty folder: the snapshot as it is and one log per device (cloud copies of a log folded into it).
 * Into a folder with data: everything the source holds, its snapshot and the log lines not yet in it, is folded into the
 * target's snapshot; no log is copied. The target keeps its own watermarks, so its logs are read exactly as before
 * (a device's lines there are not skipped, and lines it had folded and pruned are not replayed); a device only the
 * source knew keeps the source's. First-run defaults are left out: their ids are fixed, so they would otherwise undo
 * the target's renames and bring back what it deleted.
 */
export async function copyInto(from: Backend, to: Backend): Promise<void> {
  const errors: string[] = [];
  const sourceNames = (await from.list()).filter(isSyncFile);
  const targetNames = (await to.list()).filter(isSyncFile);
  const sourceSnapshot = sourceNames.includes(SNAPSHOT) ? checked(parseSnapshot((await from.read(SNAPSHOT)) ?? "")) : undefined;
  const sourceLogs = await readLogs(from, errors);

  if (targetNames.length === 0) {
    if (sourceSnapshot !== undefined) await to.write(SNAPSHOT, JSON.stringify(sourceSnapshot));

    for (const [device, changes] of sourceLogs) await to.write(logName(device), toLines(changes));

    return;
  }

  const target = targetNames.includes(SNAPSHOT) ? checked(parseSnapshot((await to.read(SNAPSHOT)) ?? "")) : emptySnapshot();
  const targetDevices = new Set([...(await readLogs(to, errors)).keys(), ...Object.keys(target.seen)]);
  const source = sourceSnapshot ?? emptySnapshot();
  const sourceOnly = Object.entries(source.seen).filter(([device]) => !targetDevices.has(device));
  // Log lines the source snapshot already folded are skipped, as load() does: replaying them would bring back an
  // entity whose tombstone the source has since purged.
  const sourceChanges = [...loadState(source, [...sourceLogs.values()].flat()).values()].filter(isReal);
  const folded = applyChanges(applyChanges(emptyState, target.entities), sourceChanges);

  const merged: Snapshot = {
    version: 1,
    compactedAt: target.compactedAt,
    seen: { ...Object.fromEntries(sourceOnly), ...target.seen },
    entities: [...folded.values()],
  };

  await to.write(SNAPSHOT, JSON.stringify(merged));
}

function checked(parsed: ParsedSnapshot): Snapshot {
  if (parsed.error !== undefined) {
    throw new Error(`${SNAPSHOT} is corrupt; refusing to merge folders`);
  }

  return parsed.snapshot;
}

const keepNothing = (): void => undefined;

/**
 * Field writes not yet on disk. A failed save, or a store still loading, keeps them for the next try.
 * `keep` is handed what waits after every change, to put somewhere that outlives the app (the folder itself is
 * what cannot be written); the next run starts from it, so quitting with unsaved changes loses nothing.
 */
export class Outbox {
  #writes: FieldWrite[];
  readonly #keep: (waiting: readonly FieldWrite[]) => void;

  constructor(kept: readonly FieldWrite[] = [], keep: (waiting: readonly FieldWrite[]) => void = keepNothing) {
    this.#writes = [...kept];
    this.#keep = keep;
  }

  get size(): number {
    return this.#writes.length;
  }

  /** `at`: the time of the edit, which the writes keep however late they are saved. */
  add(writes: readonly FieldWrite[], at: number): void {
    if (writes.length === 0) return;

    this.#writes = [...this.#writes, ...writes.map((write) => ({ ...write, at }))];
    this.#keep(this.#writes);
  }

  /** Sends everything waiting, in order. Run one at a time. On failure all of it stays and the error is rethrown. */
  async flush(store: SyncStore | undefined): Promise<void> {
    const sending = this.#writes;

    if (store === undefined || sending.length === 0) return;

    await store.setMany(sending);
    this.#writes = this.#writes.slice(sending.length);
    this.#keep(this.#writes);
  }
}
