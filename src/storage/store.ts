import { compact, loadState } from "./compact";
import { applyChanges, emptyState, materialize, type Entities, type State } from "./merge";
import { DELETED, emptySnapshot, parseLog, parseSnapshot, type Change, type EntityKind, type Json, type Snapshot } from "./schema";

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

const SNAPSHOT = "snapshot.json";

const LOG_NAME = /^log-(.+)\.jsonl$/;

const logName = (device: string) => `log-${device}.jsonl`;

const toLines = (changes: readonly Change[]) => changes.map((c) => `${JSON.stringify(c)}\n`).join("");

/**
 * Each device appends only to its own log and reads everyone else's.
 *
 * Compaction must be run by one designated device. It rewrites snapshot.json and truncates only
 * its own log; other devices' logs keep entries already folded in, and load() skips them because
 * their ts <= snapshot.seen[device]. Each device later prunes those entries from its own log.
 * Two devices compacting at once could drop each other's work, hence the single compactor.
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
    const live = own.filter((c) => c.ts > seenSelf);

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

  async set(entity: EntityKind, id: string, field: string, value: Json): Promise<void> {
    // Strictly increasing per device, even if the clock steps back: compaction relies on it.
    const ts = Math.max(this.#now(), this.#lastTs + 1);
    const change: Change = { ts, device: this.#deviceId, entity, id, field, value };

    await this.#backend.append(logName(this.#deviceId), toLines([change]));
    this.#lastTs = ts;
    this.#state = applyChanges(this.#state, [change]);
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

    // Snapshot first: if we stop in between, our old log entries are simply skipped as folded.
    await this.#backend.write(SNAPSHOT, JSON.stringify(result.snapshot));
    await this.#backend.write(logName(this.#deviceId), toLines(result.keptChanges.filter((c) => c.device === this.#deviceId)));
    await this.load();
  }

  /**
   * Compact when the logs hold more than `threshold` changes, but only on the designated
   * compactor: the device with the smallest id among those with a log. Returns whether it ran.
   */
  async compactIfDue(threshold: number): Promise<boolean> {
    await this.load();

    const devices = [...new Set([...this.#logs.keys(), this.#deviceId])].toSorted();
    const pending = [...this.#logs.values()].reduce((sum, log) => sum + log.length, 0);

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
