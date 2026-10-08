import { useState } from "react";
import type { IsoDate } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { quickTargets } from "../domain/reschedule";
import type { OverdueTask } from "../domain/schedule";
import { shortDate } from "./format";
import { CategoryTag } from "./parts";

type OverdueListProps = {
  overdue: OverdueTask[];
  today: IsoDate;
  categoryOf: (item: Item) => Category | undefined;
  onEdit: (item: Item) => void;
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
                <button type="button" className="side-title item-open" onClick={() => onEdit(item)}>
                  {item.title}
                </button>
                <span className="side-meta num">
                  {shortDate(latest)}
                  {missed > 1 && ` 등 ${missed}회`}
                </span>
                <CategoryTag category={categoryOf(item)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
