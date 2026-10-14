import { X, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { THEMES, type ThemeId } from "./themes";

export type SettingsPage = { id: string; label: string; icon: LucideIcon; content: ReactNode };

type SettingsDialogProps = {
  open: boolean;
  pages: SettingsPage[];
  onClose: () => void;
};

/** 마이페이지: settings split into pages, a menu on the left and one page at a time on the right. */
export function SettingsDialog({ open, pages, onClose }: SettingsDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState(pages[0]?.id ?? "");
  const page = pages.find((p) => p.id === current) ?? pages[0];

  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      // showModal focuses the first menu item, which then looks selected next to the current page.
      dialog.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();
    } else {
      dialog.current?.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className="settings mypage"
      aria-labelledby="settings-title"
      // Escape: handle cancel directly; WebView2 does not always fire close afterwards.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <nav className="mypage-nav" aria-label="설정 메뉴">
        <h2 id="settings-title" className="mypage-title">마이페이지</h2>
        <ul>
          {pages.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button
                type="button"
                className="mypage-link"
                aria-current={id === page?.id ? "page" : undefined}
                onClick={() => setCurrent(id)}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mypage-content">
        <header className="settings-head">
          <h3 className="mypage-page-title">{page?.label}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="설정 닫기">
            <X size={18} strokeWidth={2} />
          </button>
        </header>
        <div className="mypage-body">{page?.content}</div>
      </div>
    </dialog>
  );
}

/** "디자인": the three themes as radio cards. */
export function ThemeSettings({ theme, onTheme }: { theme: ThemeId; onTheme: (theme: ThemeId) => void }) {
  return (
    <fieldset className="settings-section">
      <legend>디자인</legend>
      <div className="theme-cards">
        {THEMES.map((option) => (
          <label key={option.id} className="theme-card">
            <input type="radio" name="theme" value={option.id} checked={option.id === theme} onChange={() => onTheme(option.id)} />
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
  );
}
