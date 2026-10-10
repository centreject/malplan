import { expect, test } from "vitest";
import { TOMBSTONE_TTL_MS } from "./compact";
import { MemoryBackend, SyncStore } from "./store";

const DAY = 24 * 60 * 60 * 1000;

/** Devices sharing one folder, each with its own adjustable clock. */
function setup() {
  const backend = new MemoryBackend();
  const clocks = new Map<string, number>();

  const device = async (id: string, start: number) => {
    clocks.set(id, start);

    const store = new SyncStore(backend, id, () => clocks.get(id) ?? 0);
    await store.load();

    return store;
  };

  const tick = (id: string, ms: number) => clocks.set(id, (clocks.get(id) ?? 0) + ms);

  return { backend, device, tick };
}

const item = async (store: SyncStore, id = "i1") => {
  await store.refresh();

  return store.entities().item.find((r) => r.id === id)?.fields;
};

test("files: one log per device plus one snapshot", async () => {
  const { backend, device } = setup();
  const a = await device("A", 1000);
  const b = await device("B", 1000);
  await a.set("item", "i1", "title", "x");
  await b.set("item", "i1", "done", ["done"]);
  await a.compact();

  expect((await backend.list()).toSorted()).toEqual(["log-A.jsonl", "log-B.jsonl", "snapshot.json"]);
});

test("A edits the time while B ticks done: both survive", async () => {
  const { device, tick } = setup();
  const a = await device("A", 1000);
  const b = await device("B", 1000);
  await a.set("item", "i1", "title", "회의");
  await b.refresh();
  tick("A", 10);
  tick("B", 20);
  await a.set("item", "i1", "time", { kind: "exact", start: { h: 15, m: 0 } });
  await b.set("item", "i1", "done", ["done"]);

  const expected = { title: "회의", time: { kind: "exact", start: { h: 15, m: 0 } }, done: ["done"] };

  expect(await item(a)).toEqual(expected);
  expect(await item(b)).toEqual(expected);
});

test("concurrent edits to the same field resolve to the later ts, whatever the sync order", async () => {
  const { device } = setup();
  const b = await device("B", 2000);
  const a = await device("A", 1000);
  await b.set("item", "i1", "title", "B later");
  await a.set("item", "i1", "title", "A earlier"); // written after B, but older timestamp

  expect(await item(a)).toEqual({ title: "B later" });
  expect(await item(b)).toEqual({ title: "B later" });
});

test("own timestamps never go backwards, even if the clock does", async () => {
  const { device, tick } = setup();
  const a = await device("A", 1000);
  await a.set("item", "i1", "title", "first");
  tick("A", -500);
  await a.set("item", "i1", "title", "second");

  expect(await item(a)).toEqual({ title: "second" });
});

test("delete on A vs edit on B: decided by timestamp", async () => {
  const { device, tick } = setup();
  const a = await device("A", 1000);
  const b = await device("B", 1000);
  await a.set("item", "i1", "title", "x");
  await b.refresh();

  // B edits offline before A's delete; it syncs afterwards but is older: stays deleted.
  tick("B", 5);
  await b.set("item", "i1", "note", "offline edit");
  tick("A", 10);
  await a.remove("item", "i1");

  expect(await item(a)).toBeUndefined();
  expect(await item(b)).toBeUndefined();

  // B edits again, now newer than the tombstone: the entity comes back with all fields.
  tick("B", 10);
  await b.set("item", "i1", "done", ["done"]);

  expect(await item(a)).toEqual({ title: "x", note: "offline edit", done: ["done"] });
});

test("compaction then further edits", async () => {
  const { backend, device, tick } = setup();
  const a = await device("A", 1000);
  const b = await device("B", 1000);
  await a.set("item", "i1", "title", "x");
  await b.set("item", "i2", "title", "y");
  tick("A", 10);
  await a.compact();

  expect(await backend.read("log-A.jsonl")).toBe("");

  tick("A", 10);
  tick("B", 30);
  await a.set("item", "i1", "place", "카페");
  await b.set("item", "i1", "title", "x2");

  for (const store of [a, b]) {
    expect(await item(store)).toEqual({ title: "x2", place: "카페" });
    expect(await item(store, "i2")).toEqual({ title: "y" });
  }

  // A fresh device sees the same state.
  const c = await device("C", 5000);

  expect(c.entities()).toEqual(a.entities());
});

test("compaction race: entries folded by another device are ignored, newer ones are not", async () => {
  const { backend, device, tick } = setup();
  const a = await device("A", 1000);
  const b = await device("B", 1000);
  await b.set("item", "gone", "title", "b-old");
  tick("A", 10);
  await a.set("item", "i1", "title", "a");
  await a.remove("item", "gone");
  tick("B", 20);
  await b.set("item", "i2", "title", "b"); // B has now passed the tombstone
  tick("A", 20);
  await a.compact(); // folds B's entries and purges "gone"

  // A never writes B's log, so it still holds entries that are now in the snapshot...
  expect(await backend.read("log-B.jsonl")).toContain("b-old");
  expect(await backend.read("snapshot.json")).not.toContain("gone");
  // ...but they are skipped on load; replaying them would resurrect "gone".
  expect(await item(a, "gone")).toBeUndefined();

  // B writes after A's compaction: newer ts, so it counts.
  tick("B", 20);
  await b.set("item", "i1", "note", "after");

  expect(await item(a)).toEqual({ title: "a", note: "after" });

  // On its next load B prunes entries already in the snapshot from its own log.
  await b.load();

  expect(await backend.read("log-B.jsonl")).not.toContain("b-old");
  expect(await item(b)).toEqual({ title: "a", note: "after" });
  expect(await item(b, "gone")).toBeUndefined();
});

test("a device offline for a long time merges by edit time, not sync time", async () => {
  const { device, tick } = setup();
  const a = await device("A", 1000);
  const c = await device("C", 1000);
  await a.set("item", "i1", "title", "x");
  await a.set("item", "gone", "title", "to delete");
  await c.refresh();

  // C goes offline. Meanwhile A keeps working, deletes and compacts a month later.
  tick("A", 20);
  await a.set("item", "i1", "title", "A later");
  await a.remove("item", "gone");
  tick("A", 30 * DAY);
  await a.compact();

  // C edited offline at 1010; those edits reach the folder only now.
  tick("C", 10);
  await c.set("item", "i1", "title", "C offline");
  await c.set("item", "i1", "place", "집");
  tick("C", 40 * DAY);

  expect(await item(a)).toEqual({ title: "A later", place: "집" });
  expect(await item(c)).toEqual({ title: "A later", place: "집" });
  expect(await item(c, "gone")).toBeUndefined();
});

test("tombstones survive compaction while a known device lags, and are purged after 90 days", async () => {
  const { backend, device, tick } = setup();
  const a = await device("A", 1000);
  const c = await device("C", 1000);
  await c.set("item", "x", "title", "C was here"); // C is a known device that then goes quiet
  tick("A", 10);
  await a.set("item", "i1", "title", "x");
  await a.remove("item", "i1");
  tick("A", 10);
  await a.compact();

  expect(await backend.read("snapshot.json")).toContain("_deleted");

  tick("A", TOMBSTONE_TTL_MS);
  await a.compact();

  expect(await backend.read("snapshot.json")).not.toContain("_deleted");
  expect(await item(c, "x")).toEqual({ title: "C was here" });
});

test("a corrupt log line is skipped and reported; other changes still load", async () => {
  const { backend, device } = setup();
  const a = await device("A", 1000);
  await a.set("item", "i1", "title", "x");
  await backend.append("log-A.jsonl", "{broken\n");
  await a.set("item", "i1", "place", "p");

  const b = await device("B", 2000);

  expect(b.entities().item).toEqual([{ id: "i1", fields: { title: "x", place: "p" } }]);
  expect(b.errors).toHaveLength(1);
  expect(b.errors[0]).toMatch(/^log-A\.jsonl line 2:/);
});

test("a corrupt snapshot is reported and never overwritten by compaction", async () => {
  const { backend, device } = setup();
  await backend.write("snapshot.json", "{oops");

  const a = await device("A", 1000);

  expect(a.errors).toHaveLength(1);
  await expect(a.compact()).rejects.toThrow(/snapshot/);
  expect(await backend.read("snapshot.json")).toBe("{oops");
});

test("compactIfDue: only the designated device (smallest id) compacts, and only past the threshold", async () => {
  const { backend, device, tick } = setup();
  const a = await device("a", 1_000);
  const b = await device("b", 1_000);

  for (let i = 0; i < 5; i++) {
    tick("a", 10);
    await a.set("item", `i${i}`, "title", `t${i}`);
  }

  await b.load();
  expect(await b.compactIfDue(3)).toBe(false);
  expect(await a.compactIfDue(100)).toBe(false);
  expect(await a.compactIfDue(3)).toBe(true);
  expect(await backend.read("snapshot.json")).toBeDefined();
  expect(a.entities().item).toHaveLength(5);
});
