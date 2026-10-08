import * as v from "valibot";

const DisplaySchema = v.object({
  weekStart: v.optional(v.picklist([0, 1]), 0),
  hideDone: v.optional(v.boolean(), false),
});

export type Display = v.InferOutput<typeof DisplaySchema>;

const KEY = "malplan.display";

export function loadDisplay(): Display {
  try {
    const parsed = v.safeParse(DisplaySchema, JSON.parse(window.localStorage.getItem(KEY) ?? "{}"));

    return parsed.success ? parsed.output : { weekStart: 0, hideDone: false };
  } catch {
    return { weekStart: 0, hideDone: false };
  }
}

export function saveDisplay(display: Display): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(display));
  } catch {
    // Storage unavailable: the setting lasts for this session only.
  }
}

type DisplaySettingsProps = { display: Display; onChange: (display: Display) => void };

/** "보기": week start and whether finished items stay visible. */
export function DisplaySettings({ display, onChange }: DisplaySettingsProps) {
  return (
    <fieldset className="settings-section window-settings">
      <legend>보기</legend>
      <label className="window-option">
        주 시작 요일
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
    </fieldset>
  );
}
