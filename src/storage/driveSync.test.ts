import { describe, expect, test } from "vitest";
import { syncWithDrive, type DriveFiles, type RemoteFile, type Synced } from "./driveSync";
import { MemoryBackend, SyncStore } from "./store";

/** Drive's appDataFolder in memory. A new md5 per content change, as Drive gives. */
class FakeDrive implements DriveFiles {
  readonly files: (RemoteFile & { content: string })[] = [];
  #next = 0;

  async list() {
    return this.files.map(({ id, name, md5 }) => ({ id, name, md5 }));
  }

  async download(id: string) {
    return this.#find(id).content;
  }

  async create(name: string, content: string) {
    const file = { id: `f${this.files.length}`, name, md5: this.#md5(), content };

    this.files.push(file);

    return { id: file.id, name, md5: file.md5 };
  }

  async update(id: string, content: string) {
    const file = this.#find(id);

    file.content = content;
    file.md5 = this.#md5();

    return { id, name: file.name, md5: file.md5 };
  }

  content(name: string) {
    return this.files.find((file) => file.name === name)?.content;
  }

  #find(id: string) {
    const file = this.files.find((f) => f.id === id);

    if (file === undefined) {
      throw new Error(`no ${id}`);
    }

    return file;
  }

  #md5() {
    this.#next += 1;

    return `md5-${this.#next}`;
  }
}

function title(store: SyncStore, id: string) {
  return store.entities().item.find((record) => record.id === id)?.fields.title;
}

/** One device: its folder, its store and what it last synced. */
function device(id: string, drive: FakeDrive) {
  const folder = new MemoryBackend();
  let clock = 1_000;
  const store = new SyncStore(folder, id, () => (clock += 1));
  let synced: Synced = {};

  return {
    folder,
    store,
    async sync() {
      const result = await syncWithDrive(folder, drive, id, synced);

      synced = result.synced;

      return result;
    },
  };
}

describe("syncWithDrive", () => {
  test("an edit on one device reaches the other through Drive", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);
    const b = device("b", drive);

    await a.store.load();
    await a.store.set("item", "i1", "title", "치과");

    expect((await a.sync()).pushed).toEqual(["log-a.jsonl"]);
    expect((await b.sync()).pulled).toEqual(["log-a.jsonl"]);

    await b.store.load();
    expect(title(b.store, "i1")).toBe("치과");
  });

  test("nothing moves when nothing changed", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);

    await a.store.load();
    await a.store.set("item", "i1", "title", "치과");
    await a.sync();

    expect(await a.sync()).toMatchObject({ pushed: [], pulled: [] });
  });

  test("both devices editing: each pushes its own log and pulls the other's, and both see both edits", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);
    const b = device("b", drive);

    await a.store.load();
    await b.store.load();
    await a.store.set("item", "i1", "title", "치과");
    await b.store.set("item", "i2", "title", "회의");
    await a.sync();
    await b.sync();
    await a.sync();

    for (const d of [a, b]) {
      await d.store.load();
      expect([title(d.store, "i1"), title(d.store, "i2")]).toEqual(["치과", "회의"]);
    }
  });

  test("another device's log changed on both sides comes down; this device's own log goes up", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);

    await a.folder.write("log-a.jsonl", "mine\n");
    await a.folder.write("log-b.jsonl", "old\n");
    await a.sync();
    await a.folder.write("log-a.jsonl", "mine, edited here\n");
    await a.folder.write("log-b.jsonl", "edited here by mistake\n");
    await drive.update(drive.files.find((f) => f.name === "log-a.jsonl")?.id ?? "", "mine, changed on Drive\n");
    await drive.update(drive.files.find((f) => f.name === "log-b.jsonl")?.id ?? "", "b's new lines\n");

    const result = await a.sync();

    expect(result).toMatchObject({ pushed: ["log-a.jsonl"], pulled: ["log-b.jsonl"] });
    expect(drive.content("log-a.jsonl")).toBe("mine, edited here\n");
    expect(await a.folder.read("log-b.jsonl")).toBe("b's new lines\n");
  });

  test("another device's log changed only here never overwrites Drive's", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);

    await drive.create("log-b.jsonl", "b's lines\n");
    await a.sync();
    await a.folder.write("log-b.jsonl", "");

    expect(await a.sync()).toMatchObject({ pushed: [], pulled: [] });
    expect(drive.content("log-b.jsonl")).toBe("b's lines\n");
  });

  test("only the app's own sync files travel: no cloud copies, no other files", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);

    await a.folder.write("log-a (1).jsonl", "copy\n");
    await a.folder.write("notes.txt", "x");
    await a.folder.write("snapshot.json", "{}");

    expect((await a.sync()).pushed).toEqual(["snapshot.json"]);
  });

  test("a second device connecting with its own snapshot merges both snapshots instead of overwriting one", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);
    const b = device("b", drive);

    for (const [d, id, name] of [[a, "i1", "치과"], [b, "i2", "회의"]] as const) {
      await d.store.load();
      await d.store.set("item", id, "title", name);
      await d.store.compact();
    }

    await a.sync();
    expect((await b.sync()).pushed).toContain("snapshot.json");

    // Only the snapshots count: the logs could already be pruned.
    for (const d of [a, b]) {
      for (const name of await d.folder.list()) {
        if (name.startsWith("log-")) await d.folder.write(name, "");
      }
    }

    await a.sync();

    for (const d of [a, b]) {
      await d.store.load();
      expect([title(d.store, "i1"), title(d.store, "i2")]).toEqual(["치과", "회의"]);
    }
  });

  test("a file Drive holds twice: the first listed is used", async () => {
    const drive = new FakeDrive();
    const a = device("a", drive);

    await drive.create("log-b.jsonl", "first\n");
    await drive.create("log-b.jsonl", "second\n");
    await a.sync();

    expect(await a.folder.read("log-b.jsonl")).toBe("first\n");
  });
});
