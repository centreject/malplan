import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Cloud, CloudOff, FolderOpen, RotateCcw } from "lucide-react";
import { useState } from "react";
import { defaultSyncDir } from "../storage/backends";
import { folderHasData, type FolderMode } from "./useBoard";

type StorageSettingsProps = {
  dir: string | undefined;
  errors: string[];
  /** Changes not yet written: they go to whichever folder is used next. */
  unsaved: number;
  onSwitch: (dir: string | undefined, mode: FolderMode) => Promise<void>;
  drive: DriveState;
};

/** The Google Drive connection, from useBoard. */
export type DriveState = {
  /** A build with the Google client, in the desktop app. */
  available: boolean;
  connected: boolean;
  /** Why the last round failed. */
  note: string | undefined;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
};

/** "저장 위치": which folder this device syncs through. */
export function StorageSettings({ dir, errors, unsaved, onSwitch, drive }: StorageSettingsProps) {
  const [pending, setPending] = useState<string | null>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const desktop = isTauri();
  /** The same warning from several lines shows once. */
  const warnings = [...new Set(errors)];

  /** A folder that cannot be read or written (offline NAS, no permission) says so; the current folder stays. */
  const attempt = async (work: () => Promise<void>) => {
    setBusy(true);
    setFailure(undefined);

    try {
      await work();
    } catch (error) {
      setFailure(`폴더를 바꾸지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const choose = (next: string | undefined) =>
    attempt(async () => {
      // The folder in use already (the default one picked by path, or another spelling of it): nothing to merge or replace.
      if (next === dir || (await sameFolder(next, dir))) {
        return;
      }

      if (await folderHasData(next)) {
        // Ask: merge into the existing data, or use only what is there.
        setPending(next ?? null);
      } else {
        await onSwitch(next, "merge");
      }
    });

  const pick = async () => {
    const picked = await open({ directory: true, multiple: false, title: "동기화 폴더 선택" });

    if (picked !== null) {
      await choose(picked);
    }
  };

  /** Signing in waits for the browser; a cancel or a timeout says so here. */
  const driveAction = async (work: () => Promise<void>, failed: string) => {
    setBusy(true);
    setFailure(undefined);

    try {
      await work();
    } catch (error) {
      setFailure(`${failed}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const confirm = (mode: FolderMode) => {
    const next = pending ?? undefined;

    setPending(undefined);

    return attempt(() => onSwitch(next, mode));
  };

  return (
    <fieldset className="settings-section storage-settings" disabled={!desktop || busy}>
      <legend>저장 위치</legend>
      {!desktop && <p className="settings-note">데스크톱 앱에서만 바꿀 수 있습니다. 브라우저에서는 이 브라우저에만 저장됩니다.</p>}
      <p className="storage-path">
        {dir ?? "이 PC (앱 데이터 폴더)"}
      </p>
      <p className="settings-note">
        다른 기기와 공유하려면 NAS 공유 폴더나 클라우드 동기화 폴더를 고르세요. 기기마다 같은 폴더를 지정하면 됩니다.
      </p>
      <div className="storage-actions">
        <button type="button" className="text-button bordered" onClick={() => void pick()}>
          <FolderOpen size={16} strokeWidth={2} /> 폴더 선택…
        </button>
        {dir !== undefined && (
          <button type="button" className="text-button bordered" onClick={() => void choose(undefined)}>
            <RotateCcw size={16} strokeWidth={2} /> 기본 폴더로
          </button>
        )}
      </div>

      {drive.available && (
        <div className="storage-drive">
          <p className="settings-note">
            {drive.connected
              ? "Google Drive와 연결됨: 이 폴더의 일정이 Drive의 malplan 전용 공간(Drive 목록에는 보이지 않음)과 맞춰집니다. 다른 PC에서도 같은 Google 계정으로 연결하세요."
              : "Google 계정으로 로그인하면 다른 PC와 일정을 맞춥니다. malplan 전용 공간만 쓰고, Drive의 다른 파일은 보지 않습니다."}
          </p>
          <div className="storage-actions">
            {drive.connected ? (
              <button type="button" className="text-button bordered" onClick={() => void driveAction(drive.disconnect, "연결을 해제하지 못했습니다")}>
                <CloudOff size={16} strokeWidth={2} /> Google Drive 연결 해제
              </button>
            ) : (
              <button type="button" className="text-button bordered" onClick={() => void driveAction(drive.connect, "Google Drive에 연결하지 못했습니다")}>
                <Cloud size={16} strokeWidth={2} /> {busy ? "브라우저에서 로그인하세요…" : "Google로 로그인해 Drive 연결"}
              </button>
            )}
          </div>
          {drive.note !== undefined && (
            <p className="window-error" role="status">
              {drive.note}
            </p>
          )}
        </div>
      )}

      {pending !== undefined && (
        <div className="storage-choice" role="alertdialog" aria-label="폴더에 기존 데이터가 있음">
          <p>이 폴더에 이미 malplan 데이터가 있습니다. 어떻게 할까요?</p>
          {unsaved > 0 && <p>저장하지 못한 변경 {unsaved}건은 어느 쪽을 골라도 이 폴더에 저장됩니다.</p>}
          <div className="storage-actions">
            <button type="button" className="text-button bordered" onClick={() => void confirm("merge")}>
              합치기 (지금 데이터도 옮김)
            </button>
            <button type="button" className="text-button bordered" onClick={() => void confirm("replace")}>
              그 폴더 데이터만 사용
            </button>
            <button type="button" className="text-button" onClick={() => setPending(undefined)}>
              취소
            </button>
          </div>
        </div>
      )}

      {failure !== undefined && (
        <p className="window-error" role="alert">
          {failure}
        </p>
      )}

      {warnings.length > 0 && (
        <details className="storage-errors">
          <summary>저장 데이터 경고 {warnings.length}건</summary>
          <ul>
            {warnings.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      )}
    </fieldset>
  );
}

/** Windows paths: case and a trailing separator do not make another folder. undefined is the default folder. */
async function sameFolder(a: string | undefined, b: string | undefined): Promise<boolean> {
  const fallback = await defaultSyncDir();
  const plain = (path: string | undefined) => (path ?? fallback).replaceAll("/", "\\").replace(/\\+$/, "").toLowerCase();

  return plain(a) === plain(b);
}
