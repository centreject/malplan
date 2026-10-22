import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { partsOf, type IsoDate } from "../domain/date";

type MonthPickerProps = {
  year: number;
  month: number;
  today: IsoDate;
  onPick: (year: number, month: number) => void;
};

type Mode = "month" | "year";

/** Years shown at once in the year grid. */
const YEARS_PER_PAGE = 12;

/**
 * The month pane's title as two buttons, the way most date pickers do it: "2026년" opens a grid of years,
 * "10월" a grid of the twelve months under that year. Picking a year moves the calendar there and goes on to the months.
 */
export function MonthPicker({ year, month, today, onPick }: MonthPickerProps) {
  const popover = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("month");
  const [viewYear, setViewYear] = useState(year);
  const current = partsOf(today);
  const firstYear = viewYear - (YEARS_PER_PAGE / 2 - 1);

  const open = (next: Mode) => {
    setMode(next);
    setViewYear(year);
  };

  return (
    <span className="month-picker">
      <button type="button" className="month-picker-part" popoverTarget="month-picker" onClick={() => open("year")} aria-label={`${year}년, 연도 고르기`}>
        <span className="num">{year}</span>년
      </button>{" "}
      <button type="button" className="month-picker-part" popoverTarget="month-picker" onClick={() => open("month")} aria-label={`${month}월, 월 고르기`}>
        <span className="num">{month}</span>월
      </button>
      {createPortal(
        <div ref={popover} id="month-picker" className="month-picker-pop" popover="auto" role="dialog" aria-label={mode === "month" ? "월 고르기" : "연도 고르기"}>
          <div className="month-picker-head">
            <button
              type="button"
              className="icon-button"
              aria-label={mode === "month" ? "이전 해" : "이전 연도들"}
              onClick={() => setViewYear(viewYear - (mode === "month" ? 1 : YEARS_PER_PAGE))}
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            {mode === "month" ? (
              <button type="button" className="month-picker-switch" onClick={() => setMode("year")} aria-label={`${viewYear}년, 연도 고르기`}>
                <span className="num">{viewYear}</span>년
              </button>
            ) : (
              <span className="month-picker-range num">
                {firstYear}–{firstYear + YEARS_PER_PAGE - 1}
              </span>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label={mode === "month" ? "다음 해" : "다음 연도들"}
              onClick={() => setViewYear(viewYear + (mode === "month" ? 1 : YEARS_PER_PAGE))}
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="month-picker-grid">
            {mode === "month"
              ? Array.from({ length: 12 }, (_, index) => index + 1).map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`month-picker-cell ${viewYear === current.year && m === current.month ? "is-today" : ""}`}
                    aria-pressed={viewYear === year && m === month}
                    onClick={() => {
                      onPick(viewYear, m);
                      popover.current?.hidePopover();
                    }}
                  >
                    <span className="num">{m}</span>월
                  </button>
                ))
              : Array.from({ length: YEARS_PER_PAGE }, (_, index) => firstYear + index).map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`month-picker-cell num ${y === current.year ? "is-today" : ""}`}
                    aria-pressed={y === year}
                    onClick={() => {
                      onPick(y, month);
                      setViewYear(y);
                      setMode("month");
                    }}
                  >
                    {y}
                  </button>
                ))}
          </div>
        </div>,
        // Outside the pane title, so the heading reads "2026년 10월" and not the whole grid.
        document.body,
      )}
    </span>
  );
}
