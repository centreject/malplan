import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { IsoDate } from "../domain/date";
import { toIcs } from "../domain/ics";
import { parseIcs } from "../domain/icsImport";
import type { Item } from "../domain/item";
import { backupJson, parseBackup, type Board } from "../storage/board";

type BackupSettingsProps = {
  board: Board;
  today: IsoDate;
  /** Puts a chosen backup's records back into the board; "exact" also deletes what the backup does not hold. */
  onRestore: (backup: Board, mode: "merge" | "exact") => void;
  /** Adds items read from another calendar's .ics file (their category is set by the caller). */
  onImport: (items: Item[]) => void;
};

/** Write text to a user-chosen file: save dialog on desktop, a download in the browser. */
async function saveText(fileName: string, content: string, mime: string): Promise<boolean> {
  if (!isTauri()) {
    const link = document.createElement("a");

    link.href = URL.createObjectURL(new Blob([content], { type: mime }));
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);

    return true;
  }

  const path = await save({ defaultPath: fileName });

  if (path === null) {
    return false;
  }

  await invoke("save_text_file", { path, content });

  return true;
}

/** "백업": export everything as JSON or the items as an .ics calendar file, and restore from a JSON backup. */
export function BackupSettings({ board, today, onRestore, onImport }: BackupSettingsProps) {
  const calendarPicker = useRef<HTMLInputElement>(null);
  /** A calendar file that was read and waits for the 가져오기 click. */
  const [calendar, setCalendar] = useState<{ name: string; items: Item[]; warnings: string[] }>();
  const [message, setMessage] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  /** A backup that was read and waits for the 복원 click: nothing changes on picking a file. */
  const [picked, setPicked] = useState<{ name: string; backup: Board }>();

  const run = async (kind: "json" | "ics") => {
    try {
      const saved = kind === "json"
        ? await saveText(`malplan-backup-${today}.json`, backupJson(board, new Date().toISOString()), "application/json")
        : await saveText(`malplan-${today}.ics`, toIcs(board.items, utcStamp()), "text/calendar");

      setMessage(saved ? "저장했습니다." : "");
    } catch (error) {
      setMessage(`저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  /** Items the board holds and the picked backup does not: what 완전히 되돌리기 deletes. */
  const dropped = picked === undefined ? 0 : board.items.filter((item) => !picked.backup.items.some((saved) => saved.id === item.id)).length;

  const restore = (backup: Board, mode: "merge" | "exact") => {
    onRestore(backup, mode);
    setPicked(undefined);
    setMessage(mode === "exact" ? "백업 상태로 완전히 되돌렸습니다." : "복원했습니다.");
  };

  const pickCalendar = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }

    // Times written in UTC or another zone are moved to this device's zone.
    const read = parseIcs(await file.text(), Intl.DateTimeFormat().resolvedOptions().timeZone, "");

    setCalendar(read.items.length === 0 ? undefined : { name: file.name, ...read });
    setMessage(read.items.length === 0 ? `${file.name}: 가져올 일정이 없습니다. 바뀐 것은 없습니다.` : "");
  };

  const pick = async (file: File | undefined) => {
    if (file === undefined) {
      return;
    }

    const backup = parseBackup(await file.text());

    setPicked(backup === undefined ? undefined : { name: file.name, backup });
    setMessage(backup === undefined ? `${file.name}: malplan 백업 파일이 아니거나 손상되었습니다. 바뀐 것은 없습니다.` : "");
  };

  return (
    <fieldset className="settings-section window-settings">
      <legend>백업</legend>
      <div className="storage-actions">
        <button type="button" className="text-button bordered" onClick={() => void run("json")}>
          <Download size={16} strokeWidth={2} /> 전체 데이터 (JSON)
        </button>
        <button type="button" className="text-button bordered" onClick={() => void run("ics")}>
          <Download size={16} strokeWidth={2} /> 캘린더 파일 (ICS)
        </button>
        <button type="button" className="text-button bordered" onClick={() => picker.current?.click()}>
          <Upload size={16} strokeWidth={2} /> 백업에서 복원 (JSON)
        </button>
        <input
          ref={picker}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(event) => {
            void pick(event.target.files?.[0]);
            // The same file can be picked again after a refusal.
            event.target.value = "";
          }}
        />
      </div>
      <div className="storage-actions">
        <button type="button" className="text-button bordered" onClick={() => calendarPicker.current?.click()}>
          <Upload size={16} strokeWidth={2} /> 캘린더 파일 가져오기 (ICS)
        </button>
        <input
          ref={calendarPicker}
          type="file"
          accept=".ics,text/calendar"
          hidden
          onChange={(event) => {
            void pickCalendar(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
      <p className="window-note">ICS 파일은 구글·네이버·아웃룩 캘린더에서 가져오기로 열 수 있고, 그 캘린더들에서 내보낸 ICS도 여기서 가져올 수 있습니다.</p>
      {calendar !== undefined && (
        <>
          <p className="window-note" role="status">
            {calendar.name}: 일정 {calendar.items.length}개를 "가져옴" 분류로 넣습니다. 같은 파일을 다시 가져오면 겹치지 않고 바뀝니다.
          </p>
          {calendar.warnings.length > 0 && (
            <ul className="window-note">
              {calendar.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="storage-actions">
            <button
              type="button"
              className="text-button bordered"
              onClick={() => {
                onImport(calendar.items);
                setCalendar(undefined);
                setMessage(`일정 ${calendar.items.length}개를 가져왔습니다.`);
              }}
            >
              가져오기
            </button>
            <button type="button" className="text-button" onClick={() => setCalendar(undefined)}>
              취소
            </button>
          </div>
        </>
      )}
      {picked !== undefined && (
        <>
          <p className="window-note" role="status">
            {picked.name}: 항목 {picked.backup.items.length}개, 분류 {picked.backup.categories.length}개. 같은 항목은 백업 내용으로 되돌리고,
            백업 뒤에 추가한 항목은 그대로 둡니다. 지워지는 것은 없습니다.
          </p>
          <div className="storage-actions">
            <button type="button" className="text-button bordered" onClick={() => restore(picked.backup, "merge")}>
              복원
            </button>
            {/* Deletes: says how much, and only on its own button. */}
            <button
              type="button"
              className="text-button bordered"
              onClick={() => restore(picked.backup, "exact")}
              title={`백업에 없는 항목 ${dropped}개와 분류·탭도 지웁니다`}
            >
              완전히 되돌리기{dropped > 0 && ` (항목 ${dropped}개 삭제)`}
            </button>
            <button type="button" className="text-button" onClick={() => setPicked(undefined)}>
              취소
            </button>
          </div>
        </>
      )}
      {message !== "" && <p className="window-note" role="status">{message}</p>}
    </fieldset>
  );
}

function utcStamp(): string {
  return `${new Date().toISOString().replaceAll(/[-:]/g, "").slice(0, 15)}Z`;
}
