import { useEffect, useRef, useState } from "react";
import type { IsoDate } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { quickTargets } from "../domain/reschedule";
import type { OverdueTask } from "../domain/schedule";
import { shortDate, weekdayName } from "./format";
import { CategoryTag } from "./parts";

/** Newest missed dates listed in the popup; older ones are only counted. */
const MISSED_SHOWN = 20;

type OverdueListProps = {
  overdue: OverdueTask[];
  today: IsoDate;
  categoryOf: (item: Item) => Category | undefined;
  onEdit: (item: Item, date?: IsoDate) => void;
  onReschedule: (ids: string[], target: IsoDate) => void;
};

/** 밀린 할 일: tick one or more, then move them with one click. */
export function OverdueList({ overdue, today, categoryOf, onEdit, onReschedule }: OverdueListProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const live = selected.filter((id) => overdue.some((o) => o.item.id === id));
  const targets = quickTargets(today);

  const move = (target: IsoDate) => {
    onReschedule(live, target);
    setSelected([]);
  };

  // "등 N회": hovering shows the missed dates and leaving hides them; a click pins them until clicked again or elsewhere.
  const [pinned, setPinned] = useState<string>();
  const [hovered, setHovered] = useState<string>();
  const popup = useRef<HTMLDivElement>(null);
  const shown = overdue.find((o) => o.item.id === (pinned ?? hovered));

  useEffect(() => {
    const element = popup.current;

    if (shown === undefined) {
      element?.hidePopover();
    } else if (element?.matches(":popover-open") === false) {
      element.showPopover();
    }
  }, [shown]);

  useEffect(() => {
    if (pinned === undefined) {
      return;
    }

    const unpin = (event: Event) => {
      // SAFETY: pointerdown targets are nodes; the popup and its trigger keep it open.
      const target = event.target as Node;

      if (!popup.current?.contains(target) && !(target instanceof Element && target.closest(`[data-missed="${pinned}"]`))) {
        setPinned(undefined);
      }
    };

    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPinned(undefined);
      }
    };

    document.addEventListener("pointerdown", unpin);
    document.addEventListener("keydown", escape);

    return () => {
      document.removeEventListener("pointerdown", unpin);
      document.removeEventListener("keydown", escape);
    };
  }, [pinned]);

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));

  return (
    <details className="side-list" open={overdue.length > 0}>
      <summary>
        밀린 할 일 <span className="count num">{overdue.length}</span>
      </summary>
      {overdue.length === 0 ? (
        <p className="empty">밀린 할 일이 없습니다.</p>
      ) : (
        <>
          <div className="reschedule-bar" role="group" aria-label="선택한 할 일 옮기기">
            <label className="reschedule-all">
              <input
                type="checkbox"
                checked={live.length === overdue.length}
                ref={(input) => {
                  if (input !== null) {
                    input.indeterminate = live.length > 0 && live.length < overdue.length;
                  }
                }}
                onChange={() => setSelected(live.length === overdue.length ? [] : overdue.map((o) => o.item.id))}
              />
              {live.length === 0 ? "선택해서 옮기기" : `${live.length}개 →`}
            </label>
            {live.length > 0 && (
              <>
                <button type="button" className="chip-button" onClick={() => move(targets.today)}>오늘</button>
                <button type="button" className="chip-button" onClick={() => move(targets.tomorrow)}>내일</button>
                <button type="button" className="chip-button" onClick={() => move(targets.weekend)}>이번 주말</button>
                <button type="button" className="chip-button" onClick={() => move(targets.nextMonday)}>다음 주 월요일</button>
                <label className="chip-button reschedule-date">
                  날짜 선택…
                  <input
                    type="date"
                    aria-label="옮길 날짜"
                    onChange={(event) => {
                      if (event.target.value !== "") {
                        move(event.target.value);
                      }
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <ul>
            {overdue.map(({ item, latest, missed }) => (
              <li key={item.id} className="side-row overdue-row">
                <input
                  type="checkbox"
                  aria-label={`${item.title} 선택`}
                  checked={live.includes(item.id)}
                  onChange={() => toggle(item.id)}
                />
                <button type="button" className="side-title item-open" onClick={() => onEdit(item, latest)}>
                  {item.title}
                </button>
                {missed.length > 1 ? (
                  <button
                    type="button"
                    className="side-meta num missed-trigger"
                    data-missed={item.id}
                    aria-expanded={shown?.item.id === item.id}
                    aria-controls="missed-dates"
                    style={shown?.item.id === item.id ? { anchorName: "--missed-dates" } : undefined}
                    onMouseEnter={() => setHovered(item.id)}
                    onMouseLeave={() => setHovered(undefined)}
                    onClick={() => {
                      // A second click closes it even with the mouse still on it.
                      setPinned(pinned === item.id ? undefined : item.id);
                      setHovered(undefined);
                    }}
                  >
                    {shortDate(latest)} 등 {missed.length}회
                  </button>
                ) : (
                  <span className="side-meta num">{shortDate(latest)}</span>
                )}
                <CategoryTag category={categoryOf(item)} />
              </li>
            ))}
          </ul>
          <div ref={popup} id="missed-dates" className="missed-dates" popover="manual" role="tooltip">
            {shown !== undefined && (
              <>
                <p className="missed-dates-head">놓친 날 {shown.missed.length}회</p>
                <ul className="num">
                  {shown.missed.toReversed().slice(0, MISSED_SHOWN).map((date) => (
                    <li key={date}>{shortDate(date)} ({weekdayName(date)})</li>
                  ))}
                </ul>
                {shown.missed.length > MISSED_SHOWN && <p className="missed-dates-more">그 전 {shown.missed.length - MISSED_SHOWN}회</p>}
              </>
            )}
          </div>
        </>
      )}
    </details>
  );
}
