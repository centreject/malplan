import { expect, test } from "vitest";
import { TOMBSTONE_TTL_MS } from "./compact";
import { copyInto, MemoryBackend, Outbox, PRUNE_AFTER_MS, SyncStore } from "./store";

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

  // Folded entries stay in A's own log for a while, then a load prunes them.
  expect(await backend.read("log-A.jsonl")).toContain("x");
  tick("A", PRUNE_AFTER_MS + 1);
  await a.load();
  expect(await backend.read("log-A.jsonl")).toBe("");

  tick("B", PRUNE_AFTER_MS + 30);
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

  // Once they are old enough, B prunes entries already in the snapshot from its own log.
  tick("B", PRUNE_AFTER_MS);
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

test("setMany writes all fields with one append, in strictly increasing ts, and they reload", async () => {
  const backend = new MemoryBackend();
  let appends = 0;
  const append = backend.append.bind(backend);

  backend.append = async (name, line) => {
    appends += 1;
    await append(name, line);
  };

  const a = new SyncStore(backend, "A", () => 1000);
  await a.load();
  await a.setMany([
    { entity: "item", id: "i1", field: "title", value: "x" },
    { entity: "item", id: "i1", field: "place", value: "p" },
    { entity: "item", id: "i2", field: "_deleted", value: true },
  ]);

  expect(appends).toBe(1);

  const ts = ((await backend.read("log-A.jsonl")) ?? "").trim().split("\n").map((line) => JSON.parse(line).ts);

  expect(ts).toEqual([1000, 1001, 1002]);
  expect(await item(a)).toEqual({ title: "x", place: "p" });
  expect(await item(a, "i2")).toBeUndefined();
});

test("merging into a folder that has its own snapshot keeps what this device had compacted", async () => {
  const from = new MemoryBackend();
  const a = new SyncStore(from, "A", () => 1000);
  await a.load();
  await a.set("item", "i1", "title", "compacted in the old folder");
  await a.compact();
  await a.set("item", "i2", "title", "still in the old log");

  const to = new MemoryBackend();
  const b = new SyncStore(to, "B", () => 2000);
  await b.load();
  await b.set("item", "i3", "title", "already in the new folder");
  await b.compact();

  await copyInto(from, to);

  const merged = new SyncStore(to, "B", () => 3000);
  await merged.load();

  expect(merged.entities().item.map((r) => r.id)).toEqual(["i1", "i2", "i3"]);
  expect(merged.errors).toEqual([]);
});

test("merging folders refuses to overwrite a corrupt snapshot", async () => {
  const from = new MemoryBackend();
  const to = new MemoryBackend();
  await from.write("snapshot.json", JSON.stringify({ version: 1, compactedAt: 0, seen: {}, entities: [] }));
  await to.write("snapshot.json", "{ cut short");

  await expect(copyInto(from, to)).rejects.toThrow("corrupt");
  expect(await to.read("snapshot.json")).toBe("{ cut short");
});

/** Like the desktop folder backend: names outside [A-Za-z0-9._-] cannot be read. */
class DesktopNames extends MemoryBackend {
  override async read(name: string) {
    if (!/^[\w.-]+$/.test(name)) {
      throw new Error(`invalid sync file name: ${name}`);
    }

    return super.read(name);
  }
}

test("a cloud conflicted copy of a log is skipped, so loading still works", async () => {
  const backend = new DesktopNames();
  const a = new SyncStore(backend, "A", () => 1000);
  await a.load();
  await a.set("item", "i1", "title", "x");
  backend.files.set("log-A (1).jsonl", backend.files.get("log-A.jsonl") ?? "");
  backend.files.set("새 텍스트 문서.txt", "memo");

  const b = new SyncStore(backend, "B", () => 2000);
  await b.load();

  expect(b.entities().item.find((r) => r.id === "i1")?.fields.title).toBe("x");
});

test("a merge copies only sync files, not whatever else the folder holds", async () => {
  const from = new MemoryBackend();
  const a = new SyncStore(from, "A", () => 1000);
  await a.load();
  await a.set("item", "i1", "title", "x");
  from.files.set("새 텍스트 문서.txt", "memo");
  from.files.set("log-A (1).jsonl", "");

  const to = new DesktopNames();
  await copyInto(from, to);

  expect([...to.files.keys()]).toEqual(["log-A.jsonl"]);
});

test("first-run defaults never override the folder they are merged into", async () => {
  const { backend: shared, device } = setup();
  const a = await device("A", 5000);
  await a.set("category", "work", "name", "회사");
  await a.set("category", "contest", "name", "공모전");
  await a.set("category", "work", "name", "직장");
  await a.remove("category", "contest");
  // The tombstone is purged here, so only the defaults' age can keep 공모전 from coming back.
  await a.compact();

  const local = new MemoryBackend();
  const b = new SyncStore(local, "B", () => 9000);
  await b.load();
  await b.seed([
    { entity: "category", id: "work", field: "name", value: "회사" },
    { entity: "category", id: "contest", field: "name", value: "공모전" },
  ]);
  await b.set("item", "i9", "title", "B에서 만든 일정");
  await copyInto(local, shared);

  const merged = new SyncStore(shared, "A", () => 10_000);
  await merged.load();
  const categories = merged.entities().category;

  expect(categories.find((r) => r.id === "work")?.fields.name).toBe("직장");
  expect(categories.find((r) => r.id === "contest")).toBeUndefined();
  expect(merged.entities().item.find((r) => r.id === "i9")?.fields.title).toBe("B에서 만든 일정");
});

test("defaults merged into an empty folder are kept", async () => {
  const local = new MemoryBackend();
  const b = new SyncStore(local, "B", () => 9000);
  await b.load();
  await b.seed([{ entity: "category", id: "work", field: "name", value: "회사" }]);

  const empty = new MemoryBackend();
  await copyInto(local, empty);
  const merged = new SyncStore(empty, "B", () => 10_000);
  await merged.load();

  expect(merged.entities().category.find((r) => r.id === "work")?.fields.name).toBe("회사");
});

/** A folder that refuses appends while `locked` (OneDrive or NAS holding the file). */
class LockableFolder extends MemoryBackend {
  locked = true;

  override async append(name: string, line: string) {
    if (this.locked) {
      throw new Error("locked");
    }

    return super.append(name, line);
  }
}

test("writes that fail stay in the outbox and go out on the next flush", async () => {
  const backend = new LockableFolder();
  const store = new SyncStore(backend, "A", () => 1000);
  await store.load();
  const outbox = new Outbox();

  outbox.add([{ entity: "item", id: "i1", field: "title", value: "x" }]);
  await expect(outbox.flush(store)).rejects.toThrow("locked");
  expect(outbox.size).toBe(1);

  backend.locked = false;
  await outbox.flush(store);
  await store.refresh();

  expect(outbox.size).toBe(0);
  expect(store.entities().item.find((r) => r.id === "i1")?.fields.title).toBe("x");
});

test("with no store yet (still loading or switching folders), writes wait in the outbox", async () => {
  const outbox = new Outbox();

  outbox.add([{ entity: "item", id: "i1", field: "title", value: "x" }]);
  await outbox.flush(undefined);

  expect(outbox.size).toBe(1);
});

test("entries folded long after they were written still wait out the grace before pruning", async () => {
  const seenByA = new MemoryBackend();
  const seenByB = new MemoryBackend();
  let now = 1_000_000;
  const a = new SyncStore(seenByA, "A", () => now);
  const b = new SyncStore(seenByB, "B", () => now);

  await a.load();
  await b.load();
  await a.set("item", "a1", "title", "from A");
  await b.set("item", "b1", "title", "from B");
  // A month without compaction (the threshold was not reached), then both compact at once.
  now += 30 * DAY;
  await copyInto(seenByA, seenByB);
  await a.compact();
  await b.compact();

  expect(await seenByB.read("log-B.jsonl")).toContain("from B");

  const synced = new MemoryBackend();

  await synced.write("snapshot.json", (await seenByA.read("snapshot.json")) ?? "");
  await synced.write("log-A.jsonl", (await seenByA.read("log-A.jsonl")) ?? "");
  await synced.write("log-B.jsonl", (await seenByB.read("log-B.jsonl")) ?? "");

  const c = new SyncStore(synced, "C", () => now);

  await c.load();
  expect(c.entities().item.map((entity) => entity.id).toSorted()).toEqual(["a1", "b1"]);
});

test("two devices compacting at once (a cloud folder syncing late) lose nothing, whichever snapshot wins", async () => {
  // Each device sees the folder as its cloud client last synced it.
  const seenByA = new MemoryBackend();
  const seenByB = new MemoryBackend();
  const a = new SyncStore(seenByA, "A", () => 1000);
  const b = new SyncStore(seenByB, "B", () => 2000);

  await a.load();
  await b.load();
  await a.set("item", "a1", "title", "from A");
  await b.set("item", "b1", "title", "from B");
  // B has received A's log; A has not received B's.
  await copyInto(seenByA, seenByB);
  await a.compact();
  await b.compact();

  // The cloud keeps A's snapshot (written last) and each device's own log.
  const synced = new MemoryBackend();

  await synced.write("snapshot.json", (await seenByA.read("snapshot.json")) ?? "");
  await synced.write("log-A.jsonl", (await seenByA.read("log-A.jsonl")) ?? "");
  await synced.write("log-B.jsonl", (await seenByB.read("log-B.jsonl")) ?? "");

  const c = new SyncStore(synced, "C", () => 3000);

  await c.load();
  expect(c.entities().item.map((entity) => entity.id).toSorted()).toEqual(["a1", "b1"]);
});
