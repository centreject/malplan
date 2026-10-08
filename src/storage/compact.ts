import { applyChanges, cellKey, emptyState, groupEntities, tombstoneOf, type State } from "./merge";
import type { Change, Snapshot } from "./schema";

export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

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
 * `seen` never runs ahead of real time. A tombstone, with all its entity's fields, is purged once
 * every known device's watermark has passed it (per-device ts only grows, so no older edit can
 * still arrive) or after 90 days.
 *
 * ponytail: after a 90-day purge, an edit older than the tombstone from a device offline longer
 * than that brings back a partial entity. Accepted; raise the TTL if it ever happens in practice.
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

    if (tomb === undefined || (tomb.ts > watermark && tomb.ts > now - TOMBSTONE_TTL_MS)) continue;

    for (const c of cells) state.delete(cellKey(c));
  }

  return {
    snapshot: { version: 1, compactedAt: now, seen: Object.fromEntries(seen), entities: [...state.values()] },
    keptChanges,
  };
}
