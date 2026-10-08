import { useState } from "react";
import { ensurePermission, notify, type NotificationSettings as Settings } from "./notifications";

type NotificationSettingsProps = {
  settings: Settings;
  onChange: (settings: Settings) => void;
};

const LEADS: [number, string][] = [[5, "5분 전"], [10, "10분 전"], [15, "15분 전"], [30, "30분 전"], [60, "1시간 전"]];

/** "알림": on/off and the default lead for items without their own reminder. */
export function NotificationSettings({ settings, onChange }: NotificationSettingsProps) {
  const [denied, setDenied] = useState(false);

  const enable = async (enabled: boolean) => {
    if (enabled && !(await ensurePermission())) {
      setDenied(true);

      return;
    }

    setDenied(false);
    onChange({ ...settings, enabled });
  };

  return (
    <fieldset className="settings-section window-settings">
      <legend>알림</legend>
      <label className="window-option">
        <input type="checkbox" checked={settings.enabled} onChange={(event) => void enable(event.target.checked)} />
        일정 알림 받기
      </label>
      {denied && <p className="window-error">알림 권한이 거부되었습니다. Windows 설정 → 알림에서 malplan을 허용하세요.</p>}
      <label className="window-option">
        기본 알림 시각
        <select
          value={settings.lead}
          disabled={!settings.enabled}
          onChange={(event) => onChange({ ...settings, lead: Number(event.target.value) })}
        >
          {LEADS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <p className="window-note">
        시각이 정해진 일정은 시작 전에, 시간대 일정은 그 시간대가 시작할 때, 시간 미정 일정은 아침 8시에 한 번 알립니다.
        일정마다 확인 화면에서 따로 정할 수도 있습니다.
      </p>
      {settings.enabled && (
        <div className="storage-actions">
          <button type="button" className="text-button bordered" onClick={() => notify("malplan", "알림이 이렇게 표시됩니다.")}>
            알림 보내보기
          </button>
        </div>
      )}
    </fieldset>
  );
}
