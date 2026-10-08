import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { THEMES, type ThemeId } from "./themes";

type SettingsDialogProps = {
  open: boolean;
  theme: ThemeId;
  onTheme: (theme: ThemeId) => void;
  onClose: () => void;
};

/** Settings window. Only the design choice for now; more sections join later. */
export function SettingsDialog({ open, theme, onTheme, onClose }: SettingsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [open]);

  return (
    <dialog ref={dialog} className="settings" aria-labelledby="settings-title" onClose={onClose}>
      <header className="settings-head">
        <h2 id="settings-title">설정</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="설정 닫기">
          <X size={18} strokeWidth={2} />
        </button>
      </header>

      <fieldset className="settings-section">
        <legend>디자인</legend>
        <div className="theme-cards">
          {THEMES.map((option) => (
            <label key={option.id} className="theme-card">
              <input
                type="radio"
                name="theme"
                value={option.id}
                checked={option.id === theme}
                onChange={() => onTheme(option.id)}
              />
              <span className="theme-swatch" aria-hidden="true">
                {option.swatch.map((color) => (
                  <span key={color} style={{ background: color }} />
                ))}
              </span>
              <span className="theme-name">{option.name}</span>
              <span className="theme-desc">{option.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </dialog>
  );
}
