import { compact, loadState } from "./compact";
import { applyChanges, emptyState, materialize, type Entities, type State } from "./merge";
import { DELETED, emptySnapshot, parseLog, parseSnapshot, type Change, type EntityKind, type Json, type ParsedSnapshot, type Snapshot } from "./schema";

/** A folder of sync files: local, NAS or Drive appData. */
export interface Backend {
  list(): Promise<string[]>;
  read(name: string): Promise<string | undefined>;
  write(name: string, content: string): Promise<void>;
  append(name: string, line: string): Promise<void>;
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

export type FieldWrite = Pick<Change, "entity" | "id" | "field" | "value">;

const SNAPSHOT = "snapshot.json";

/** Same characters the desktop backend can read, so a cloud "conflicted copy" of a log is skipped, not fatal. */
const LOG_NAME = /^log-([\w.-]+)\.jsonl$/;

const isSyncFile = (name: string) => name === SNAPSHOT || LOG_NAME.test(name);

/**
 * First-run defaults are dated 1, 2, 3… instead of now (there are far fewer than 1000 of them, and real
 * clocks are far above it), so any real edit wins over them and a merge into a folder with data leaves them out.
 */
const DEFAULTS_BEFORE = 1000;

const isReal = (change: Change) => change.ts >= DEFAULTS_BEFORE;

/** How long a device keeps its own folded log entries before pruning them. */
export const PRUNE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const logName = (device: string) => `log-${device}.jsonl`;

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
  #snapshotCorrupt = false;
  #logs = new Map<string, Change[]>();
  #state: State = emptyState;
  #lastTs = -Infinity;

  constructor(backend: Backend, deviceId: string, now: () => number) {
    this.#backend = backend;
    this.#deviceId = deviceId;
    this.#now = now;
  }

  /** Reads the snapshot and every log, and merges them. */
  async load(): Promise<void> {
    const errors: string[] = [];
    const snapshotText = await this.#backend.read(SNAPSHOT);
    const parsed = snapshotText === undefined ? { snapshot: emptySnapshot() } : parseSnapshot(snapshotText);

    if (parsed.error !== undefined) errors.push(`${SNAPSHOT}: ${parsed.error}`);

    const logs = new Map<string, Change[]>();

    for (const name of await this.#backend.list()) {
      const device = LOG_NAME.exec(name)?.[1];

      if (device === undefined) continue;

      const log = parseLog((await this.#backend.read(name)) ?? "", device);

      errors.push(...log.errors.map((e) => `${name} ${e}`));
      logs.set(device, log.changes);
    }

    this.errors = errors;
    this.#snapshot = parsed.snapshot;
    this.#snapshotCorrupt = parsed.error !== undefined;
    this.#logs = logs;
    this.#state = loadState(parsed.snapshot, [...logs.values()].flat());

    const seenSelf = new Map(Object.entries(parsed.snapshot.seen)).get(this.#deviceId) ?? -Infinity;
    const own = logs.get(this.#deviceId) ?? [];
    // Folded entries stay a while: if another device compacted at the same time and its snapshot wins (a cloud
    // folder syncing late), entries only our snapshot held are still in our log.
    const live = own.filter((c) => c.ts > seenSelf || c.ts > this.#now() - PRUNE_AFTER_MS);

    for (const c of own) this.#lastTs = Math.max(this.#lastTs, c.ts);

    this.#lastTs = Math.max(this.#lastTs, seenSelf);

    if (live.length < own.length) {
      await this.#backend.write(logName(this.#deviceId), toLines(live));
      logs.set(this.#deviceId, live);
    }
  }

  /** Re-reads other devices' files (and a snapshot another device may have written). */
  refresh(): Promise<void> {
    return this.load();
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
    const changes = writes.map(({ entity, id, field, value }): Change => {
      ts = Math.max(now, ts + 1);

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

    if (this.#snapshotCorrupt) throw new Error(`${SNAPSHOT} is corrupt; refusing to overwrite it`);

    const known = [...new Set([...this.#logs.keys(), this.#deviceId])];
    const result = compact(this.#snapshot, this.#logs, this.#now(), known);

    // Our own log is pruned by load(), past PRUNE_AFTER_MS, not here: see there.
    await this.#backend.write(SNAPSHOT, JSON.stringify(result.snapshot));
    await this.load();
  }

  /**
   * Compact when the logs hold more than `threshold` changes, but only on the designated
   * compactor: the device with the smallest id among those with a log. Returns whether it ran.
   * Decides from the last load() plus this device's writes since, so it is cheap when not due.
   */
  async compactIfDue(threshold: number): Promise<boolean> {
    const devices = [...new Set([...this.#logs.keys(), this.#deviceId])].toSorted();
    const seen = new Map(Object.entries(this.#snapshot.seen));
    // Entries already folded but kept for a while (PRUNE_AFTER_MS) are not pending.
    const pending = [...this.#logs.values()].flat().filter((c) => c.ts > (seen.get(c.device) ?? -Infinity)).length;

    if (devices[0] !== this.#deviceId || pending <= threshold || this.#snapshotCorrupt) {
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
 * Copies one sync folder's files into another ("merge" when switching folders). Logs are appended;
 * when both folders have a snapshot, they are merged so neither folder's compacted data is dropped.
 * Only sync files are copied. Into a folder that already has data, first-run defaults are left out:
 * their ids are fixed, so they would otherwise undo that folder's renames and bring back deleted entries.
 */
export async function copyInto(from: Backend, to: Backend): Promise<void> {
  const existing = new Set((await to.list()).filter(isSyncFile));
  const names = (await from.list()).filter(isSyncFile);

  for (const name of names) {
    const text = (await from.read(name)) ?? "";

    if (existing.size === 0) {
      await to.write(name, text);
    } else if (name === SNAPSHOT) {
      const ours = withoutDefaults(checked(parseSnapshot(text)));
      const theirs = existing.has(SNAPSHOT) ? checked(parseSnapshot((await to.read(SNAPSHOT)) ?? "")) : undefined;

      await to.write(SNAPSHOT, JSON.stringify(theirs === undefined ? ours : mergeSnapshots(ours, theirs)));
    } else {
      const lines = toLines(parseLog(text, LOG_NAME.exec(name)?.[1] ?? "").changes.filter(isReal));

      await (existing.has(name) ? to.append(name, lines) : to.write(name, lines));
    }
  }
}

function checked(parsed: ParsedSnapshot): Snapshot {
  if (parsed.error !== undefined) {
    throw new Error(`${SNAPSHOT} is corrupt; refusing to merge folders`);
  }

  return parsed.snapshot;
}

function withoutDefaults(snapshot: Snapshot): Snapshot {
  return { ...snapshot, entities: snapshot.entities.filter(isReal) };
}

/**
 * Both snapshots' winning changes. `seen` keeps, per device, only the lower watermark of the two, so no log
 * entry that only one folder had folded is skipped (re-applying an entry the snapshot holds changes nothing).
 */
function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const seenB = new Map(Object.entries(b.seen));

  const seen = Object.entries(a.seen).flatMap(([device, ts]): [string, number][] => {
    const other = seenB.get(device);

    return other === undefined ? [] : [[device, Math.min(ts, other)]];
  });

  return {
    version: 1,
    compactedAt: Math.max(a.compactedAt, b.compactedAt),
    seen: Object.fromEntries(seen),
    entities: [...applyChanges(applyChanges(emptyState, a.entities), b.entities).values()],
  };
}

/** Field writes not yet on disk. A failed save, or a store still loading, keeps them for the next try. */
export class Outbox {
  #writes: FieldWrite[] = [];

  get size(): number {
    return this.#writes.length;
  }

  add(writes: readonly FieldWrite[]): void {
    this.#writes = [...this.#writes, ...writes];
  }

  /** Sends everything waiting, in order. Run one at a time. On failure all of it stays and the error is rethrown. */
  async flush(store: SyncStore | undefined): Promise<void> {
    const sending = this.#writes;

    if (store === undefined || sending.length === 0) return;

    await store.setMany(sending);
    this.#writes = this.#writes.slice(sending.length);
  }
}
