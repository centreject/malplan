import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDays, partsOf, type IsoDate, type Weekday } from "../domain/date";
import { weekStartOf, weeksOfMonth } from "../domain/weeks";
import { shortDate } from "./format";

type WeekPickerProps = {
  /** "10월 3주차". */
  label: string;
  /** First day of the week shown. */
  first: IsoDate;
  today: IsoDate;
  start: Weekday;
  onPick: (weekStart: IsoDate) => void;
};

type ViewMonth = { year: number; month: number };

/** The week pane's title as a button: the weeks of a month, a month at a time, like the month pane's picker. */
export function WeekPicker({ label, first, today, start, onPick }: WeekPickerProps) {
  const popover = useRef<HTMLDivElement>(null);
  // A week belongs to the month of its first day, so that month is where the picker opens.
  const [view, setView] = useState<ViewMonth>(() => partsOf(first));
  const thisWeek = weekStartOf(today, start);

  const step = (delta: number) => {
    const index = view.year * 12 + (view.month - 1) + delta;

    setView({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  };

  return (
    <span className="month-picker week-picker">
      <button type="button" className="month-picker-part" popoverTarget="week-picker" onClick={() => setView(partsOf(first))} aria-label={`${label}, 주 고르기`}>
        {label}
      </button>
      {createPortal(
        <div ref={popover} id="week-picker" className="month-picker-pop week-picker-pop" popover="auto" role="dialog" aria-label="주 고르기">
          <div className="month-picker-head">
            <button type="button" className="icon-button" aria-label="이전 달" onClick={() => step(-1)}>
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <span className="month-picker-range">
              <span className="num">{view.year}</span>년 <span className="num">{view.month}</span>월
            </span>
            <button type="button" className="icon-button" aria-label="다음 달" onClick={() => step(1)}>
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="week-picker-list">
            {weeksOfMonth(view.year, view.month, start).map((weekStart, index) => (
              <button
                key={weekStart}
                type="button"
                className={`week-picker-row ${weekStart === thisWeek ? "is-today" : ""}`}
                aria-pressed={weekStart === weekStartOf(first, start)}
                onClick={() => {
                  onPick(weekStart);
                  popover.current?.hidePopover();
                }}
              >
                <span>{index + 1}주차</span>
                <span className="num">
                  {shortDate(weekStart)} – {shortDate(addDays(weekStart, 6))}
                </span>
              </button>
            ))}
          </div>
        </div>,
        // Outside the pane title, so the heading reads "10월 3주차" and not the list.
        document.body,
      )}
    </span>
  );
}
