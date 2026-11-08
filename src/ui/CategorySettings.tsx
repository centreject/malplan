import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UNCATEGORIZED_ID } from "../domain/categories";
import type { Category } from "../domain/item";
import { ALL_TAB_ID, type CalendarTab } from "../domain/tabs";

type CategorySettingsProps = {
  categories: Category[];
  tabs: CalendarTab[];
  onAdd: () => string;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, slot: number) => void;
  /** Any "#rrggbb" colour instead of a palette slot. */
  onCustomColor: (id: string, hex: string) => void;
  onDelete: (id: string) => void;
};

const SLOTS = [1, 2, 3, 4, 5, 6];

/** "분류" section of the settings dialog: rename, recolour, delete and add categories. */
export function CategorySettings({ categories, tabs, onAdd, onRename, onRecolor, onCustomColor, onDelete }: CategorySettingsProps) {
  const [added, setAdded] = useState<string>();
  const emptyTabs = tabs.filter((t) => t.id !== ALL_TAB_ID && t.categoryIds?.length === 0);

  return (
    <fieldset className="settings-section">
      <legend>분류</legend>
      <ul className="cat-rows">
        {categories.map((c) =>
          c.id === UNCATEGORIZED_ID ? (
            <li key={c.id} className="cat-row">
              <span className="cat-slots" aria-hidden="true">
                <span className="cat-slot cat-0" />
              </span>
              <span className="cat-row-fixed">{c.name}</span>
            </li>
          ) : (
            <li key={c.id} className="cat-row">
              <span className="cat-slots" role="radiogroup" aria-label={`${c.name} 색`}>
                {SLOTS.map((slot) => (
                  <input
                    key={slot}
                    type="radio"
                    name={`cat-slot-${c.id}`}
                    className={`cat-slot cat-${slot}`}
                    checked={c.color === undefined && c.colorSlot === slot}
                    onChange={() => onRecolor(c.id, slot)}
                    aria-label={`색 ${slot}`}
                  />
                ))}
                <label className={`cat-custom ${c.color === undefined ? "" : "is-on"}`} title="직접 지정">
                  <ColorInput key={c.color ?? "none"} value={c.color ?? "#888888"} label={`${c.name} 색 직접 지정`} onPick={(hex) => onCustomColor(c.id, hex)} />
                </label>
                <input
                  key={c.color ?? "none"}
                  className="cat-hex"
                  defaultValue={c.color?.toUpperCase() ?? ""}
                  placeholder="#RRGGBB"
                  aria-label={`${c.name} 색상 코드`}
                  maxLength={7}
                  autoComplete="off"
                  onBlur={(event) => {
                    const raw = event.currentTarget.value.trim();
                    const hex = raw.startsWith("#") ? raw : `#${raw}`;

                    if (raw !== "") {
                      onCustomColor(c.id, hex);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
              </span>
              <input
                key={c.name}
                className="cat-row-name"
                defaultValue={c.name}
                aria-label="분류 이름"
                autoComplete="off"
                autoFocus={c.id === added}
                onFocus={(event) => event.currentTarget.select()}
                onBlur={(event) => {
                  if (event.currentTarget.value.trim() === "") {
                    event.currentTarget.value = c.name;
                  }

                  onRename(c.id, event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              <button
                type="button"
                className="icon-button"
                onClick={() => onDelete(c.id)}
                aria-label={`${c.name} 삭제`}
                title="삭제 (항목은 미분류로)"
              >
                <Trash2 size={16} strokeWidth={2} />
              </button>
            </li>
          ),
        )}
      </ul>
      <button type="button" className="text-button cat-add" onClick={() => setAdded(onAdd())}>
        <Plus size={16} strokeWidth={2} aria-hidden="true" />
        분류 추가
      </button>
      {emptyTabs.map((t) => (
        <p key={t.id} className="cat-warning">
          <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
          탭 &apos;{t.name}&apos;에 남은 분류가 없습니다
        </p>
      ))}
    </fieldset>
  );
}

/**
 * Saves once, when the picker closes (the native change event). React's onChange fires on every step of a drag,
 * and each save is a line in the sync log.
 */
function ColorInput({ value, label, onPick }: { value: string; label: string; onPick: (hex: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const pick = useRef(onPick);

  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    const element = input.current;

    const commit = () => {
      if (element !== null) {
        pick.current(element.value);
      }
    };

    element?.addEventListener("change", commit);

    return () => element?.removeEventListener("change", commit);
  }, []);

  return <input ref={input} type="color" defaultValue={value} aria-label={label} />;
}
