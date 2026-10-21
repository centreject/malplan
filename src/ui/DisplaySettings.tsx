import * as v from "valibot";
import { loadStored, saveStored } from "../storage/localStore";

const DisplaySchema = v.object({
  /** The month grid's first column: Monday, as on Korean office calendars. */
  weekStart: v.optional(v.picklist([0, 1]), 1),
  hideDone: v.optional(v.boolean(), false),
  /** The week pane: its start day (Monday, as on Korean office calendars), arrow step, and whether the month follows. */
  weekNumberStart: v.optional(v.picklist([0, 1, 2, 3, 4, 5, 6]), 1),
  weekMove: v.optional(v.picklist(["week", "day"]), "week"),
  syncMonth: v.optional(v.boolean(), true),
});

export type Display = v.InferOutput<typeof DisplaySchema>;

const KEY = "malplan.display";

const DEFAULT_DISPLAY: Display = v.parse(DisplaySchema, {});

const WEEKDAY_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

export function loadDisplay(): Display {
  return loadStored(KEY, DisplaySchema, DEFAULT_DISPLAY);
}

export function saveDisplay(display: Display): void {
  saveStored(KEY, display);
}

type DisplaySettingsProps = { display: Display; onChange: (display: Display) => void };

/** "보기": week start and whether finished items stay visible. */
export function DisplaySettings({ display, onChange }: DisplaySettingsProps) {
  return (
    <fieldset className="settings-section window-settings">
      <legend>보기</legend>
      <label className="window-option">
        달력 주 시작 요일
        <select
          value={display.weekStart}
          onChange={(event) => onChange({ ...display, weekStart: event.target.value === "1" ? 1 : 0 })}
        >
          <option value={0}>일요일 (일월화수목금토)</option>
          <option value={1}>월요일 (월화수목금토일)</option>
        </select>
      </label>
      <label className="window-option">
        <input
          type="checkbox"
          checked={display.hideDone}
          onChange={(event) => onChange({ ...display, hideDone: event.target.checked })}
        />
        완료한 할 일 숨기기
      </label>
      <label className="window-option">
        주차 시작 요일 (주간 표시의 "10월 2주차")
        <select
          value={display.weekNumberStart}
          onChange={(event) => onChange({ ...display, weekNumberStart: v.parse(DisplaySchema.entries.weekNumberStart, Number(event.target.value)) })}
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <option key={label} value={index}>
              {label}
              {index === 1 ? " (관공서 기준)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="window-option">
        주간 표시 화살표 이동
        <select
          value={display.weekMove}
          onChange={(event) => onChange({ ...display, weekMove: event.target.value === "day" ? "day" : "week" })}
        >
          <option value="week">1주일씩</option>
          <option value="day">하루씩</option>
        </select>
      </label>
      <label className="window-option">
        <input
          type="checkbox"
          checked={display.syncMonth}
          onChange={(event) => onChange({ ...display, syncMonth: event.target.checked })}
        />
        주간 표시의 달이 바뀌면 달력도 함께 이동
      </label>
    </fieldset>
  );
}
