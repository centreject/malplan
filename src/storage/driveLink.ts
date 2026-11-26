// The app's Google Drive connection: a signed-in session plus what was last synced, kept per device.
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { DriveApi } from "./driveApi";
import { SyncedSchema, syncWithDrive, type DriveSyncResult } from "./driveSync";
import { GoogleSession, savedRefreshToken, signIn, signOut, type GoogleClient } from "./googleAuth";
import { loadStored, saveStored, writeStored } from "./localStore";
import type { Backend } from "./store";

/** What each file held when this device and Drive last matched (see syncWithDrive). */
const SYNCED_KEY = "malplan.driveSynced";

export type DriveLink = { round: (local: Backend) => Promise<DriveSyncResult> };

function link(client: GoogleClient, refresh: string, device: string): DriveLink {
  const session = new GoogleSession(client, refresh, tauriFetch, Date.now);
  const api = new DriveApi(() => session.token(), tauriFetch);

  return {
    round: async (local) => {
      const result = await syncWithDrive(local, api, device, loadStored(SYNCED_KEY, SyncedSchema, {}));

      saveStored(SYNCED_KEY, result.synced);

      return result;
    },
  };
}

/** The connection made before, if this device signed in and has not signed out. */
export async function savedDriveLink(client: GoogleClient, device: string): Promise<DriveLink | undefined> {
  const refresh = await savedRefreshToken();

  return refresh === undefined ? undefined : link(client, refresh, device);
}

export async function connectDrive(client: GoogleClient, device: string): Promise<DriveLink> {
  return link(client, await signIn(client, tauriFetch), device);
}

export async function disconnectDrive(): Promise<void> {
  await signOut(tauriFetch);
  forgetDriveSync();
}

/** Another local folder holds other files: the next round compares from scratch (a changed snapshot is merged). */
export function forgetDriveSync(): void {
  writeStored(SYNCED_KEY, undefined);
}
