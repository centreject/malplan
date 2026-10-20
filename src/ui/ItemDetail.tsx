import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { IsoDate } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { monthDay, recurrenceLabel, timeLabel, weekdayName } from "./format";
import { CategoryTag } from "./parts";

type ItemDetailProps = {
  item: Item;
  /** The occurrence that was clicked, for repeating items. */
  date: IsoDate | undefined;
  categories: Category[];
  onEdit: () => void;
  onClose: () => void;
  /** "말로 고치기": a short request like "3시로 바꿔". */
  onCommand: (text: string) => void;
  /** Status or hint for the last request. */
  commandNote: string | undefined;
};

/** Read-only view of a saved item; 수정 opens the edit dialog. New entries go straight to editing instead. */
export function ItemDetail({ item, date, categories, onEdit, onClose, onCommand, commandNote }: ItemDetailProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [request, setRequest] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const rows: [string, ReactNode][] = [
    ["종류", item.kind === "event" ? "일정" : "할 일"],
    ["날짜", whenText(item, date)],
    ["시간", timeLabel(item.time)],
    ["분류", <CategoryTag key="category" category={categories.find((c) => c.id === item.categoryId)} />],
  ];

  if (item.place !== undefined && item.place !== "") {
    rows.push(["장소", item.place]);
  }

  if (item.note !== undefined && item.note !== "") {
    rows.push(["메모", item.note]);
  }

  if (item.remindMinutes !== undefined) {
    rows.push(["알림", `${item.remindMinutes}분 전`]);
  }

  if (item.kind === "task") {
    rows.push(["상태", item.done.includes(date ?? "done") ? "완료" : "미완료"]);
  }

  return (
    <dialog
      ref={dialog}
      className="settings item-detail"
      aria-labelledby="item-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="settings-head">
        <h2 id="item-detail-title">{item.title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="닫기">
          <X size={18} strokeWidth={2} />
        </button>
      </header>
      <dl className="detail-rows">
        {rows.map(([label, value]) => (
          <div key={label} className="detail-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <form
        className="detail-command"
        onSubmit={(event) => {
          event.preventDefault();

          if (request.trim() !== "") {
            onCommand(request.trim());
          }
        }}
      >
        <label htmlFor="detail-command-input" className="detail-command-label">말로 고치기</label>
        <span className="detail-command-row">
          <input
            id="detail-command-input"
            className="cf-input"
            value={request}
            placeholder="예: 3시로 바꿔, 하루 미뤄, 장소는 강남역으로"
            autoComplete="off"
            onChange={(event) => setRequest(event.target.value)}
          />
          <button type="submit" className="confirm-button">고치기</button>
        </span>
        {commandNote !== undefined && <p className="detail-command-note" role="status">{commandNote}</p>}
      </form>
      <footer className="confirm-foot">
        <button type="button" className="confirm-button" onClick={onClose}>
          닫기
        </button>
        <button type="button" className="confirm-button is-primary" onClick={onEdit}>
          수정
        </button>
      </footer>
    </dialog>
  );
}

function dayText(date: IsoDate): string {
  return `${monthDay(date)} (${weekdayName(date)})`;
}

function whenText(item: Item, date: IsoDate | undefined): string {
  switch (item.when.kind) {
    case "single":
      return dayText(item.when.date);
    case "range":
      return `${dayText(item.when.start)} – ${dayText(item.when.end)}`;
    case "recurring":
      return date === undefined ? recurrenceLabel(item.when.rule) : `${recurrenceLabel(item.when.rule)} · 이번: ${dayText(date)}`;
    case "none":
      return "날짜 없음";
  }
}
