import { expect, test } from "vitest";
import { compact, loadState, TOMBSTONE_TTL_MS } from "./compact";
import { materialize } from "./merge";
import { emptySnapshot, type Change, type Json } from "./schema";

const ch = (ts: number, device: string, field: string, value: Json, id = "i1"): Change => ({
  ts, device, entity: "item", id, field, value,
});

const view = (snapshot = emptySnapshot(), changes: Change[] = []) =>
  materialize(loadState(snapshot, changes)).item;

test("folds all logs into the snapshot and records the last folded ts per device", () => {
  const logs = new Map([
    ["A", [ch(1, "A", "title", "a"), ch(4, "A", "title", "a4")]],
    ["B", [ch(3, "B", "done", ["done"])]],
  ]);

  const { snapshot, keptChanges } = compact(emptySnapshot(), logs, 100, ["A", "B"]);

  expect(keptChanges).toEqual([]);
  expect(snapshot.compactedAt).toBe(100);
  expect(snapshot.seen).toEqual({ A: 4, B: 3 });
  expect(view(snapshot)).toEqual([{ id: "i1", fields: { title: "a4", done: ["done"] } }]);
});

test("merging after compaction still uses per-field timestamps", () => {
  const { snapshot } = compact(emptySnapshot(), new Map([["A", [ch(5, "A", "title", "a")]]]), 100, ["A"]);

  expect(view(snapshot, [ch(4, "B", "title", "older")])[0]?.fields).toEqual({ title: "a" });
  expect(view(snapshot, [ch(6, "B", "title", "newer")])[0]?.fields).toEqual({ title: "newer" });
});

test("log entries already folded into the snapshot are ignored", () => {
  const first = compact(emptySnapshot(), new Map([["B", [ch(3, "B", "title", "b3")]]]), 100, ["B"]).snapshot;
  // A later edit by A wins over b3; replaying B's stale log must not change that.
  const second = compact(first, new Map([["A", [ch(5, "A", "title", "a5")]]]), 200, ["A", "B"]).snapshot;

  expect(view(second, [ch(3, "B", "title", "b3")])[0]?.fields).toEqual({ title: "a5" });
  expect(loadState(second, [ch(3, "B", "title", "b3")])).toEqual(loadState(second, []));
});

test("changes dated after `now` (clock skew) stay in the log instead of the snapshot", () => {
  const future = ch(500, "B", "title", "future");
  const { snapshot, keptChanges } = compact(emptySnapshot(), new Map([["B", [ch(1, "B", "title", "x"), future]]]), 100, ["B"]);

  expect(keptChanges).toEqual([future]);
  expect(snapshot.seen).toEqual({ B: 1 });
  expect(view(snapshot, keptChanges)[0]?.fields).toEqual({ title: "future" });
});

const deleted = [ch(1, "A", "title", "x"), ch(10, "A", "_deleted", true)];

test("a tombstone is kept while some known device has not passed it", () => {
  const logs = new Map([["A", deleted], ["B", [ch(5, "B", "title", "other", "i2")]]]);
  const { snapshot } = compact(emptySnapshot(), logs, 100, ["A", "B"]);

  expect(snapshot.entities.filter((c) => c.id === "i1")).toHaveLength(2);
});

test("a tombstone is purged once every known device has passed it", () => {
  const logs = new Map([["A", deleted], ["B", [ch(11, "B", "title", "other", "i2")]]]);
  const { snapshot } = compact(emptySnapshot(), logs, 100, ["A", "B"]);

  expect(snapshot.entities.map((c) => c.id)).toEqual(["i2"]);
});

test("a tombstone is purged after 90 days even if a device never caught up", () => {
  const logs = new Map([["A", deleted], ["B", [ch(5, "B", "title", "other", "i2")]]]);

  expect(compact(emptySnapshot(), logs, 10 + TOMBSTONE_TTL_MS - 1, ["A", "B"]).snapshot.entities).toHaveLength(3);
  expect(compact(emptySnapshot(), logs, 10 + TOMBSTONE_TTL_MS, ["A", "B"]).snapshot.entities).toHaveLength(1);
});

test("a resurrected entity (edit newer than tombstone) is not purged", () => {
  const logs = new Map([["A", [...deleted, ch(11, "A", "done", ["done"])]]]);
  const { snapshot } = compact(emptySnapshot(), logs, 10 + TOMBSTONE_TTL_MS, ["A"]);

  expect(view(snapshot)).toEqual([{ id: "i1", fields: { title: "x", done: ["done"] } }]);
});
