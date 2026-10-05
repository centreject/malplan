import { CornerDownLeft } from "lucide-react";
import { useState } from "react";
import type { IsoDate } from "../domain/date";
import { parseKorean } from "../parse/parseKorean";
import { parseSummary } from "./format";
import { THEMES, type ThemeId } from "./themes";

type TopBarProps = {
  today: IsoDate;
  theme: ThemeId;
  onTheme: (theme: ThemeId) => void;
};

export function TopBar({ today, theme, onTheme }: TopBarProps) {
  const [text, setText] = useState("");
  const summary = text.trim() === "" ? "" : parseSummary(parseKorean(text, today));

  return (
    <header className="top-bar">
      <span className="brand">malplan</span>

      <form className="quick-add" onSubmit={(event) => event.preventDefault()}>
        <label className="visually-hidden" htmlFor="quick-add-input">
          일정을 문장으로 입력
        </label>
        <input
          id="quick-add-input"
          className="quick-add-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="예: 12월 28일까지 매주 수요일 오후 4시 회사 우편물 발송"
          autoComplete="off"
        />
        <button type="submit" className="quick-add-submit" aria-label="확인 화면 열기 (준비 중)" disabled={summary === ""}>
          <CornerDownLeft size={16} strokeWidth={2} />
        </button>
        <output className="quick-add-preview" htmlFor="quick-add-input" aria-live="polite">
          {summary}
        </output>
      </form>

      <div className="theme-switch" role="radiogroup" aria-label="테마">
        {THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={option.id === theme}
            className="theme-option"
            onClick={() => onTheme(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </header>
  );
}
