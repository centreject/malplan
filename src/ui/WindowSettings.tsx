import { isTauri } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useEffect, useState } from "react";
import {
  applyShortcut,
  comboFromKey,
  applyWindowBehaviour,
  closesToTray,
  loadAppSettings,
  saveAppSettings,
  shortcutLabel,
  shortcutStatus,
  type AppSettings,
} from "./appSettings";

/** Settings section "시작 · 창": autostart, tray, close button, global shortcut. */
export function WindowSettings() {
  const desktop = isTauri();
  const [settings, setSettings] = useState<AppSettings>(loadAppSettings);
  const [autostart, setAutostart] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    if (desktop) {
      isEnabled().then(setAutostart, () => setAutostart(false));
      void shortcutStatus().then(setShortcutError);
    }
  }, [desktop]);

  const update = (next: AppSettings) => {
    setSettings(next);
    saveAppSettings(next);
    void applyWindowBehaviour(next);

    if (next.shortcut !== settings.shortcut || next.combo !== settings.combo) {
      void applyShortcut(next.shortcut, next.combo).then(async (error) => {
        // A combo another program holds is not kept: the old one is put back.
        if (error !== null && next.combo !== settings.combo) {
          setSettings(settings);
          saveAppSettings(settings);
          await applyShortcut(settings.shortcut, settings.combo);
        }

        setShortcutError(error);
      });
    }
  };

  const toggleAutostart = async (on: boolean) => {
    try {
      await (on ? enable() : disable());
    } finally {
      setAutostart(await isEnabled());
    }
  };

  return (
    <fieldset className="settings-section window-settings" disabled={!desktop}>
      <legend>시작 · 창</legend>
      {!desktop && <p className="window-note">데스크톱 앱에서만 바꿀 수 있습니다.</p>}

      <label className="window-option">
        <input
          type="checkbox"
          checked={autostart}
          onChange={(event) => void toggleAutostart(event.currentTarget.checked)}
        />
        Windows 시작 시 자동 실행
      </label>

      <label className="window-option">
        <input
          type="checkbox"
          checked={settings.tray}
          onChange={(event) => update({ ...settings, tray: event.currentTarget.checked })}
        />
        트레이 아이콘 표시
      </label>

      <fieldset className="window-close" disabled={!settings.tray}>
        <legend>닫기(X) 버튼</legend>
        <label className="window-option">
          <input
            type="radio"
            name="close-button"
            checked={closesToTray(settings)}
            onChange={() => update({ ...settings, closeToTray: true })}
          />
          트레이로 최소화
        </label>
        <label className="window-option">
          <input
            type="radio"
            name="close-button"
            checked={!closesToTray(settings)}
            onChange={() => update({ ...settings, closeToTray: false })}
          />
          종료
        </label>
      </fieldset>

      <label className="window-option">
        <input
          type="checkbox"
          checked={settings.shortcut}
          onChange={(event) => update({ ...settings, shortcut: event.currentTarget.checked })}
        />
        전역 단축키로 입력창 열기 <kbd>{shortcutLabel(settings.combo)}</kbd>
      </label>
      {desktop && (
        <span className="window-option shortcut-record">
          {recording ? (
            <input
              className="cf-input"
              aria-label="새 단축키"
              readOnly
              autoFocus
              value=""
              placeholder="새 조합을 누르세요 (Esc: 취소)"
              onBlur={() => setRecording(false)}
              onKeyDown={(event) => {
                event.preventDefault();

                if (event.key === "Escape") {
                  setRecording(false);

                  return;
                }

                const combo = comboFromKey(event);

                if (combo !== undefined) {
                  setRecording(false);
                  update({ ...settings, combo });
                }
              }}
            />
          ) : (
            <button type="button" className="text-button bordered" onClick={() => setRecording(true)}>
              단축키 바꾸기
            </button>
          )}
        </span>
      )}
      {shortcutError !== null && (
        <p className="window-error" role="alert">
          {shortcutError}
        </p>
      )}
    </fieldset>
  );
}
