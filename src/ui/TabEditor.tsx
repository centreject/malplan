import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Category } from "../domain/item";
import { nextTabName, type CalendarTab } from "../domain/tabs";
import { CategoryDot } from "./parts";

type CategoryChecklistProps = {
  categories: Category[];
  selected: string[];
  onChange: (ids: string[]) => void;
};

/** Excel-filter-style list: "모두 선택" plus one checkbox per category. */
export function CategoryChecklist({ categories, selected, onChange }: CategoryChecklistProps) {
  const selectAll = useRef<HTMLInputElement>(null);
  const allChecked = categories.every((c) => selected.includes(c.id));

  useEffect(() => {
    if (selectAll.current !== null) {
      selectAll.current.indeterminate = selected.length > 0 && !allChecked;
    }
  }, [selected, allChecked]);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  return (
    <ul className="cat-checklist">
      <li>
        <label className="cat-check is-all">
          <input
            ref={selectAll}
            type="checkbox"
            checked={allChecked}
            onChange={() => onChange(allChecked ? [] : categories.map((c) => c.id))}
          />
          모두 선택
        </label>
      </li>
      {categories.map((c) => (
        <li key={c.id}>
          <label className="cat-check">
            <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} />
            <CategoryDot category={c} />
            {c.name}
          </label>
        </li>
      ))}
    </ul>
  );
}

type TabEditorProps = {
  /** The tab being edited; undefined adds a new one. */
  tab: CalendarTab | undefined;
  tabs: CalendarTab[];
  categories: Category[];
  onSave: (name: string, categoryIds: string[]) => void;
  onDelete: () => void;
  /** Moves the edited tab by -1 / +1 right away. */
  onMove: (delta: number) => void;
  onClose: () => void;
};

/** Add or edit a calendar tab. Mounted only while open. */
export function TabEditor({ tab, tabs, categories, onSave, onDelete, onMove, onClose }: TabEditorProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(tab?.name ?? "");
  const [selected, setSelected] = useState<string[]>(tab?.categoryIds ?? []);
  const index = tab === undefined ? -1 : tabs.indexOf(tab);
  const empty = selected.length === 0;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="settings tab-editor" aria-labelledby="tab-editor-title" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (!empty) {
            onSave(name, selected);
          }
        }}
      >
        <header className="settings-head">
          <h2 id="tab-editor-title">{tab === undefined ? "탭 추가" : "탭 편집"}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="settings-section">
          <label className="tab-editor-name">
            <span>이름</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={tab?.name ?? nextTabName(tabs)}
              autoComplete="off"
            />
          </label>
        </div>

        <fieldset className="settings-section">
          <legend>보여 줄 분류</legend>
          <CategoryChecklist categories={categories} selected={selected} onChange={setSelected} />
          {empty && <p className="tab-editor-hint">분류를 하나 이상 고르세요.</p>}
        </fieldset>

        <footer className="tab-editor-actions">
          {tab !== undefined && (
            <>
              <button
                type="button"
                className="icon-button"
                onClick={() => onMove(-1)}
                disabled={index <= 1}
                aria-label="왼쪽으로 이동"
                title="왼쪽으로 이동"
              >
                <ChevronLeft size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => onMove(1)}
                disabled={index >= tabs.length - 1}
                aria-label="오른쪽으로 이동"
                title="오른쪽으로 이동"
              >
                <ChevronRight size={18} strokeWidth={2} />
              </button>
              <button type="button" className="text-button tab-editor-delete" onClick={onDelete}>
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                탭 삭제
              </button>
            </>
          )}
          <button type="button" className="text-button tab-editor-cancel" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="text-button tab-editor-save" disabled={empty}>
            저장
          </button>
        </footer>
      </form>
    </dialog>
  );
}
