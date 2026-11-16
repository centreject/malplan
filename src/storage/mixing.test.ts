// Random mixes of edits, deletions, reloads (which prune), compactions and a folder merge across devices with
// skewed clocks. Whatever the order, once every device has reloaded, each one must show exactly what plain
// last-writer-wins over every change ever written gives: nothing lost, nothing brought back.
import { expect, test } from "vitest";
import { applyChanges, emptyState, materialize, type Entities } from "./merge";
import { DELETED, type Change } from "./schema";
import { copyInto, MemoryBackend, SyncStore } from "./store";

/** Small seeded generator (mulberry32), so a failing seed can be replayed. */
function random(seed: number): () => number {
  let a = seed;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const MINUTE = 60_000;

const DAY = 24 * 60 * MINUTE;

type Device = { id: string; store: SyncStore };

/** A folder that also keeps every log line ever appended: the logs themselves are pruned once folded. */
class RecordingBackend extends MemoryBackend {
  constructor(readonly written: Change[]) {
    super();
  }

  override async append(name: string, line: string) {
    await super.append(name, line);

    for (const text of line.split("\n").filter((l) => l !== "")) {
      // SAFETY: only SyncStore appends in this test; every line is one Change.
      this.written.push(JSON.parse(text) as Change);
    }
  }
}

async function run(seed: number): Promise<{ shown: Entities[]; expected: Entities }> {
  const rand = random(seed);

  const pick = <T>(list: readonly T[]): T => {
    const found = list[Math.floor(rand() * list.length)];

    if (found === undefined) throw new Error("empty list");

    return found;
  };

  let clock = 1_800_000_000_000;
  const now = (skew: number) => () => clock + skew;

  const written: Change[] = [];
  const x = new RecordingBackend(written);
  const y = new RecordingBackend(written);

  const open = (id: string, folder: MemoryBackend): Device => {
    const skew = Math.round((rand() - 0.5) * 10 * MINUTE);

    return { id, store: new SyncStore(folder, id, now(skew)) };
  };

  // a and b start in folder x; c and d in folder y, now or only after the merge (y empty at merge time).
  const yStartsEmpty = rand() < 0.3;
  let devices: Device[] = [open("a", x), open("b", x), ...(yStartsEmpty ? [] : [open("c", y), open("d", y)])];
  let merged = false;
  // Before the merge each folder has its own items, as two folders that never shared data do. Two folders that once
  // did (one copied from the other) lose a deletion in a merge once the deleting folder has purged the tombstone.
  const inX = ["x1", "x2", "x3"];
  const inY = ["y1", "y2", "y3"];
  const idsFor = (device: Device) => (merged ? [...inX, ...inY] : device.id === "a" || device.id === "b" ? inX : inY);
  // Ids are never reused after a deletion: an edit landing on an entity whose tombstone was purged brings back a
  // partial record (accepted, see compact.ts), which plain last-writer-wins would show whole.
  const retired = new Set<string>();

  for (const device of devices) await device.store.load();

  for (let step = 0; step < 250; step++) {
    clock += rand() < 0.05 ? Math.round(rand() * 10 * DAY) : Math.round(rand() * 5 * MINUTE);

    if (!merged && step > 100 && (rand() < 0.05 || step === 200)) {
      await copyInto(x, y);
      devices = [...devices.filter((d) => d.id === "c" || d.id === "d"), open("a", y), open("b", y)];

      if (yStartsEmpty) devices.push(open("c", y), open("d", y));

      for (const device of devices) await device.store.load();

      merged = true;
      continue;
    }

    const device = pick(devices);
    const live = idsFor(device).filter((id) => !retired.has(id));
    const roll = rand();

    if (roll < 0.5 && live.length > 0) {
      await device.store.setMany([
        { entity: "item", id: pick(live), field: pick(["title", "note", "order"]), value: Math.floor(rand() * 100) },
      ]);
    } else if (roll < 0.55 && live.length > 0) {
      const id = pick(live);

      retired.add(id);
      await device.store.set("item", id, DELETED, true);
    } else if (roll < 0.8) {
      await device.store.refresh();
    } else {
      await device.store.compactIfDue(3);
    }
  }

  const shown: Entities[] = [];

  for (const device of devices) {
    await device.store.refresh();
    shown.push(device.store.entities());
  }

  return { shown, expected: materialize(applyChanges(emptyState, written)) };
}

test.each(Array.from({ length: 60 }, (_, i) => i + 1))("seed %i: every device ends with what last-writer-wins gives", async (seed) => {
  const { shown, expected } = await run(seed);

  for (const entities of shown) expect(entities).toEqual(expected);
});
