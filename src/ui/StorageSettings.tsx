import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, RotateCcw } from "lucide-react";
import { useState } from "react";
import { folderHasData, type FolderMode } from "./useBoard";

type StorageSettingsProps = {
  dir: string | undefined;
  errors: string[];
  onSwitch: (dir: string | undefined, mode: FolderMode) => Promise<void>;
};

/** "저장 위치": which folder this device syncs through. */
export function StorageSettings({ dir, errors, onSwitch }: StorageSettingsProps) {
  const [pending, setPending] = useState<string | null>();
  const [busy, setBusy] = useState(false);
  const desktop = isTauri();

  const choose = async (next: string | undefined) => {
    setBusy(true);

    try {
      if (await folderHasData(next)) {
        // Ask: merge into the existing data, or use only what is there.
        setPending(next ?? null);
      } else {
        await onSwitch(next, "merge");
      }
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    const picked = await open({ directory: true, multiple: false, title: "동기화 폴더 선택" });

    if (picked !== null) {
      await choose(picked);
    }
  };

  const confirm = async (mode: FolderMode) => {
    const next = pending ?? undefined;

    setPending(undefined);
    setBusy(true);

    try {
      await onSwitch(next, mode);
    } finally {
      setBusy(false);
    }
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
        <button type="button" className="text-button bordered" disabled title="준비 중">
          Google Drive 연결 (준비 중)
        </button>
      </div>

      {pending !== undefined && (
        <div className="storage-choice" role="alertdialog" aria-label="폴더에 기존 데이터가 있음">
          <p>이 폴더에 이미 malplan 데이터가 있습니다. 어떻게 할까요?</p>
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

      {errors.length > 0 && (
        <details className="storage-errors">
          <summary>저장 데이터 경고 {errors.length}건</summary>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </details>
      )}
    </fieldset>
  );
}
