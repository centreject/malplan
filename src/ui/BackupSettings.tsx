import { invoke, isTauri } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Download } from "lucide-react";
import { useState } from "react";
import type { IsoDate } from "../domain/date";
import { toIcs } from "../domain/ics";
import type { Board } from "../storage/board";

type BackupSettingsProps = { board: Board; today: IsoDate };

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

/** "백업": export everything as JSON, or the items as an .ics calendar file. */
export function BackupSettings({ board, today }: BackupSettingsProps) {
  const [message, setMessage] = useState("");

  const run = async (kind: "json" | "ics") => {
    try {
      const saved = kind === "json"
        ? await saveText(
            `malplan-backup-${today}.json`,
            JSON.stringify({ app: "malplan", version: 1, exportedAt: new Date().toISOString(), ...board }, null, 2),
            "application/json",
          )
        : await saveText(`malplan-${today}.ics`, toIcs(board.items, utcStamp()), "text/calendar");

      setMessage(saved ? "저장했습니다." : "");
    } catch (error) {
      setMessage(`저장하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }
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
      </div>
      <p className="window-note">ICS 파일은 구글·네이버·아웃룩 캘린더에서 가져오기로 열 수 있습니다.</p>
      {message !== "" && <p className="window-note" role="status">{message}</p>}
    </fieldset>
  );
}

function utcStamp(): string {
  return `${new Date().toISOString().replaceAll(/[-:]/g, "").slice(0, 15)}Z`;
}
