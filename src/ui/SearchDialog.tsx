import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { IsoDate } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { searchItems } from "../domain/search";
import { shortDate, timeLabel, weekdayName } from "./format";
import { CategoryTag } from "./parts";

type SearchDialogProps = {
  items: Item[];
  categories: Category[];
  today: IsoDate;
  onOpen: (item: Item, date: IsoDate | undefined) => void;
  onClose: () => void;
};

const MAX_RESULTS = 50;

/** Find items by title, place or note; choosing one opens it in the edit dialog. */
export function SearchDialog({ items, categories, today, onOpen, onClose }: SearchDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const results = searchItems(items, query, today).slice(0, MAX_RESULTS);

  useEffect(() => {
    if (dialog.current?.open === false) {
      dialog.current.showModal();
    }

    // showModal focuses the first control (the close button); typing should go to the query.
    input.current?.focus();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="settings search"
      aria-labelledby="search-title"
      // Escape: handle cancel directly; WebView2 does not always fire close afterwards.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <header className="settings-head">
        <h2 id="search-title">검색</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="검색 닫기">
          <X size={18} strokeWidth={2} />
        </button>
      </header>
      <div className="search-body">
        <input
          className="quick-add-input search-input"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="제목, 장소, 비고에서 찾기"
          aria-label="검색어"
          ref={input}
        />
        {query.trim() !== "" && results.length === 0 && <p className="empty">찾는 항목이 없습니다.</p>}
        <ul className="search-results">
          {results.map(({ item, date }) => (
            <li key={item.id}>
              <button type="button" className="search-row" onClick={() => onOpen(item, date)}>
                <span className="search-date num">{date === undefined ? "날짜 없음" : `${shortDate(date)} ${weekdayName(date)}`}</span>
                <span className="search-title">
                  {item.title}
                  <span className="search-sub">
                    {[timeLabel(item.time), item.place].filter((part) => part !== undefined && part !== "").join(" · ")}
                  </span>
                </span>
                <CategoryTag category={categories.find((c) => c.id === item.categoryId)} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </dialog>
  );
}
