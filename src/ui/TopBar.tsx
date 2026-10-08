import { CornerDownLeft, Search, Settings } from "lucide-react";
import type { IsoDate } from "../domain/date";
import { parseKorean } from "../parse/parseKorean";
import { parseSummary } from "./format";

type TopBarProps = {
  today: IsoDate;
  text: string;
  onText: (text: string) => void;
  /** Opens the confirm screen for the current text. */
  onSubmit: () => void;
  onSettings: () => void;
  onSearch: () => void;
};

export function TopBar({ today, text, onText, onSubmit, onSettings, onSearch }: TopBarProps) {
  const summary = text.trim() === "" ? "" : parseSummary(parseKorean(text, today));

  return (
    <header className="top-bar">
      <span className="brand">malplan</span>

      <form
        className="quick-add"
        onSubmit={(event) => {
          event.preventDefault();

          if (text.trim() !== "") {
            onSubmit();
          }
        }}
      >
        <label className="visually-hidden" htmlFor="quick-add-input">
          일정을 문장으로 입력
        </label>
        <input
          id="quick-add-input"
          className="quick-add-input"
          value={text}
          onChange={(event) => onText(event.target.value)}
          placeholder="예: 12월 28일까지 매주 수요일 오후 4시 회사 우편물 발송"
          autoComplete="off"
        />
        <button type="submit" className="quick-add-submit" aria-label="확인 화면 열기" disabled={text.trim() === ""}>
          <CornerDownLeft size={16} strokeWidth={2} />
        </button>
        <output className="quick-add-preview" htmlFor="quick-add-input" aria-live="polite">
          {summary}
        </output>
      </form>

      <div className="top-actions">
        <button type="button" className="icon-button settings-button" onClick={onSearch} aria-label="검색 (Ctrl+F)" title="검색 (Ctrl+F)">
          <Search size={20} strokeWidth={2} />
        </button>
        <button type="button" className="icon-button settings-button" onClick={onSettings} aria-label="설정">
          <Settings size={20} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
