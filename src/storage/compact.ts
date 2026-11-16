import { applyChanges, cellKey, emptyState, groupEntities, tombstoneOf, type State } from "./merge";
import type { Change, Snapshot } from "./schema";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A deleted entity's fields are dropped after this even if some device never caught up. */
export const TOMBSTONE_TTL_MS = 90 * DAY_MS;

/**
 * The deletion mark itself is kept this long. Another folder with the same items (a copy, or one the devices moved
 * away from) may still hold them; merging it in within this time deletes them there too instead of bringing them back.
 */
export const TOMBSTONE_KEEP_MS = 365 * DAY_MS;

export type Compacted = { snapshot: Snapshot; keptChanges: Change[] };

function seenOf(snapshot: Snapshot): Map<string, number> {
  return new Map(Object.entries(snapshot.seen));
}

/** Log entries the snapshot does not already hold (ts above that device's `seen` watermark). */
function unfolded(snapshot: Snapshot, changes: readonly Change[]): Change[] {
  const seen = seenOf(snapshot);

  return changes.filter((c) => c.ts > (seen.get(c.device) ?? -Infinity));
}

/** Snapshot plus log entries; entries already folded into the snapshot are skipped. */
export function loadState(snapshot: Snapshot, changes: readonly Change[]): State {
  return applyChanges(applyChanges(emptyState, snapshot.entities), unfolded(snapshot, changes));
}

/**
 * Folds every log into one snapshot. Changes dated after `now` (clock skew) stay in the log so
 * `seen` never runs ahead of real time. A deleted entity's fields are dropped once every known
 * device's watermark has passed its tombstone (per-device ts only grows, so no older edit can still
 * arrive) or after 90 days; the tombstone alone (about 100 bytes) stays for a year, then goes too.
 *
 * ponytail: after the year, an edit older than the tombstone (a device offline that long, or a
 * merged folder that diverged that long ago) brings back a partial entity. Accepted.
 */
export function compact(
  snapshot: Snapshot,
  logsByDevice: ReadonlyMap<string, readonly Change[]>,
  now: number,
  knownDevices: readonly string[],
): Compacted {
  const seen = seenOf(snapshot);
  const folded: Change[] = [];
  const keptChanges: Change[] = [];

  for (const change of unfolded(snapshot, [...logsByDevice.values()].flat())) {
    if (change.ts > now) {
      keptChanges.push(change);
      continue;
    }

    folded.push(change);
    seen.set(change.device, Math.max(seen.get(change.device) ?? -Infinity, change.ts));
  }

  const watermark = Math.min(...knownDevices.map((d) => seen.get(d) ?? -Infinity));
  const state = new Map(applyChanges(loadState(snapshot, []), folded));

  for (const cells of groupEntities(state).values()) {
    const tomb = tombstoneOf(cells);

    if (tomb === undefined) continue;

    const expired = tomb.ts <= now - TOMBSTONE_KEEP_MS;

    if (!expired && tomb.ts > watermark && tomb.ts > now - TOMBSTONE_TTL_MS) continue;

    for (const c of cells) if (expired || c !== tomb) state.delete(cellKey(c));
  }

  return {
    snapshot: { version: 1, compactedAt: now, seen: Object.fromEntries(seen), entities: [...state.values()] },
    keptChanges,
  };
}
