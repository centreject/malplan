// Google Drive as a transport: the local sync folder stays the store (the app and the MCP server read it), and this
// copies its sync files to and from the Drive appDataFolder. Merging is the store's job, as for any synced folder.
import * as v from "valibot";
import { copyInto, isOwnSyncFile, logName, MemoryBackend, type Backend } from "./store";

/** A file in the Drive appDataFolder. `md5` changes whenever its content does. */
export type RemoteFile = { id: string; name: string; md5: string };

/** The few Drive calls the transport needs; the app passes the REST client, tests an in-memory fake. */
export interface DriveFiles {
  list(): Promise<RemoteFile[]>;
  download(id: string): Promise<string>;
  create(name: string, content: string): Promise<RemoteFile>;
  update(id: string, content: string): Promise<RemoteFile>;
}

/** What each file held when the two sides last matched: a hash of the local text and Drive's md5. */
export const SyncedSchema = v.record(v.string(), v.object({ local: v.string(), remote: v.string() }));

export type Synced = v.InferOutput<typeof SyncedSchema>;

export type DriveSyncResult = { synced: Synced; pushed: string[]; pulled: string[] };

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * One round: each sync file goes the way it changed since the last round. What this device writes (its own log, the
 * snapshot) goes up when changed here. Another device's log only ever comes down when Drive has a newer one: that
 * device is its only writer, so a local copy never overwrites it (it goes up only when Drive has none yet). The snapshot changed on both sides (a second device connecting, two devices
 * compacting) is merged, not overwritten: what only the other one held may already be pruned from the logs.
 * Drive may hold two files of one name (two first uploads at once); the first
 * listed is used. Nothing is deleted: a log only grows or is pruned in place, and the snapshot is rewritten.
 */
export async function syncWithDrive(local: Backend, drive: DriveFiles, device: string, synced: Synced): Promise<DriveSyncResult> {
  const next: Synced = { ...synced };
  const pushed: string[] = [];
  const pulled: string[] = [];
  const remote = new Map<string, RemoteFile>();

  for (const file of await drive.list()) {
    if (isOwnSyncFile(file.name) && !remote.has(file.name)) {
      remote.set(file.name, file);
    }
  }

  const names = new Set([...(await local.list()).filter(isOwnSyncFile), ...remote.keys()]);

  for (const name of [...names].toSorted()) {
    const text = await local.read(name);
    const localHash = text === undefined ? undefined : await hash(text);
    const file = remote.get(name);
    const last = synced[name];
    const localChanged = localHash !== undefined && localHash !== last?.local;
    const remoteChanged = file !== undefined && file.md5 !== last?.remote;
    const ours = name === logName(device) || name === "snapshot.json";

    if (name === "snapshot.json" && localChanged && remoteChanged && file !== undefined) {
      const theirs = new MemoryBackend();

      await theirs.write(name, await drive.download(file.id));
      await copyInto(theirs, local);

      const merged = (await local.read(name)) ?? "";
      const sent = await drive.update(file.id, merged);

      next[name] = { local: await hash(merged), remote: sent.md5 };
      pushed.push(name);
    } else if (localChanged && (ours || file === undefined) && text !== undefined && localHash !== undefined) {
      const sent = file === undefined ? await drive.create(name, text) : await drive.update(file.id, text);

      next[name] = { local: localHash, remote: sent.md5 };
      pushed.push(name);
    } else if (remoteChanged && file !== undefined) {
      const received = await drive.download(file.id);

      await local.write(name, received);
      next[name] = { local: await hash(received), remote: file.md5 };
      pulled.push(name);
    }
  }

  return { synced: next, pushed, pulled };
}
