import { DELETED, type Change, type EntityKind, type Json } from "./schema";

/** The winning change per (entity, id, field). Keys are opaque; Maps keep untrusted ids off object prototypes. */
export type State = ReadonlyMap<string, Change>;

export const emptyState: State = new Map();

export function cellKey(change: Change): string {
  return JSON.stringify([change.entity, change.id, change.field]);
}

/** Total order: later ts, then larger deviceId, then larger value text (same device, same ms). */
export function wins(a: Change, b: Change): boolean {
  if (a.ts !== b.ts) return a.ts > b.ts;

  if (a.device !== b.device) return a.device > b.device;

  return JSON.stringify(a.value) > JSON.stringify(b.value);
}

/** Field-level last-writer-wins. Pure, order-independent and idempotent. */
export function applyChanges(state: State, changes: readonly Change[]): State {
  const next = new Map(state);

  for (const change of changes) {
    const key = cellKey(change);
    const current = next.get(key);

    if (current === undefined || wins(change, current)) next.set(key, change);
  }

  return next;
}

/** Cells grouped per entity. */
export function groupEntities(state: State): Map<string, Change[]> {
  const groups = new Map<string, Change[]>();

  for (const change of state.values()) {
    const key = JSON.stringify([change.entity, change.id]);
    const group = groups.get(key);

    if (group === undefined) groups.set(key, [change]);
    else group.push(change);
  }

  return groups;
}

/** The entity's tombstone if it is deleted: `_deleted: true` and no other field edited after it. */
export function tombstoneOf(cells: readonly Change[]): Change | undefined {
  const tomb = cells.find((c) => c.field === DELETED);

  if (tomb === undefined || tomb.value !== true) return undefined;

  return cells.some((c) => c !== tomb && wins(c, tomb)) ? undefined : tomb;
}

export type EntityRecord = { id: string; fields: Record<string, Json> };

export type Entities = Record<EntityKind, EntityRecord[]>;

/** Plain records per entity kind, sorted by id, without deleted entities or the tombstone field. */
export function materialize(state: State): Entities {
  const out: Entities = { item: [], category: [], tab: [], settings: [] };

  for (const cells of groupEntities(state).values()) {
    const [first] = cells;

    if (first === undefined || tombstoneOf(cells) !== undefined) continue;

    const fields: [string, Json][] = [];

    for (const c of cells) if (c.field !== DELETED) fields.push([c.field, c.value]);

    out[first.entity].push({ id: first.id, fields: Object.fromEntries(fields) });
  }

  for (const records of Object.values(out)) records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return out;
}
