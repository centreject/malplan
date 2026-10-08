import { Plus } from "lucide-react";
import { partsOf, weekdayOf, type IsoDate, type Weekday } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { monthCells, occurrencesOn } from "../domain/schedule";
import { WEEKDAY_NAMES, startLabel } from "./format";
import { ItemMark, PaneHeader } from "./parts";


export type CalendarTab = {
  id: string;
  name: string;
  /** undefined = every category (the default "전체" tab). */
  categoryIds: string[] | undefined;
};

type MonthPaneProps = {
  year: number;
  month: number;
  weekStart: Weekday;
  today: IsoDate;
  selected: IsoDate;
  items: Item[];
  categories: Category[];
  holidays: Map<IsoDate, string>;
  /** Items listed per cell before "+n"; the desk theme shows fewer so numerals dominate. */
  cellCapacity: number;
  tabs: CalendarTab[];
  activeTab: string;
  onTab: (id: string) => void;
  onSelect: (date: IsoDate) => void;
  onEdit: (item: Item) => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: (() => void) | undefined;
};

export function MonthPane(props: MonthPaneProps) {
  const cells = monthCells(props.year, props.month, props.weekStart);
  const headers = Array.from({ length: 7 }, (_, index) => (props.weekStart + index) % 7);
  const tab = props.tabs.find((t) => t.id === props.activeTab);
  const tabSlot = tabColorSlot(tab, props.categories);
  const categoryOf = (item: Item) => props.categories.find((c) => c.id === item.categoryId);

  return (
    <section className={`pane pane-month tab-frame cat-${tabSlot}`} aria-label="이번 달 할 일">
      <PaneHeader
        unit="달"
        resetLabel="이번 달"
        onPrev={props.onPrev}
        onNext={props.onNext}
        onReset={props.onReset}
        title={
          <>
            <span className="num">{props.year}</span>년 <span className="num">{props.month}</span>월
          </>
        }
      >
        <div className="tabs" role="tablist" aria-label="달력 탭">
          {props.tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === props.activeTab}
              className={`tab cat-${tabColorSlot(t, props.categories)}`}
              onClick={() => props.onTab(t.id)}
            >
              {t.name}
            </button>
          ))}
          <button type="button" className="tab tab-add" aria-label="탭 추가" title="탭 추가 (준비 중)" disabled>
            <Plus size={16} strokeWidth={2} />
          </button>
        </div>
      </PaneHeader>

      <div className="month-grid" role="grid" aria-label={`${props.year}년 ${props.month}월`}>
        {headers.map((weekday) => (
          <span key={weekday} role="columnheader" className={`month-weekday ${toneOf(weekday, false)}`}>
            {WEEKDAY_NAMES[weekday]}
          </span>
        ))}
        {cells.map((date) => {
          const { month, day } = partsOf(date);
          const occurrences = occurrencesOn(props.items, date);
          const holiday = props.holidays.get(date);
          const outside = month !== props.month;

          return (
            <div
              key={date}
              role="gridcell"
              tabIndex={0}
              className={[
                "month-cell",
                outside ? "is-outside" : "",
                date === props.today ? "is-today" : "",
                date === props.selected ? "is-selected" : "",
              ].join(" ")}
              onClick={() => props.onSelect(date)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  props.onSelect(date);
                }
              }}
            >
              <span className="month-head">
                <span className={`month-day num ${toneOf(weekdayOf(date), holiday !== undefined)}`}>{day}</span>
                {holiday !== undefined && <span className="month-holiday">{holiday}</span>}
              </span>
              <ul className="month-items">
                {occurrences.slice(0, props.cellCapacity).map(({ item, done }) => (
                  <li key={item.id}>
                    <button type="button" className={`month-item item-open ${done ? "is-done" : ""}`} onClick={() => props.onEdit(item)}>
                      <ItemMark category={categoryOf(item)} task={item.kind === "task"} done={done} />
                      <span className="month-item-title">{item.title}</span>
                    </button>
                  </li>
                ))}
                {occurrences.length > props.cellCapacity && (
                  <li className="month-more">+{occurrences.length - props.cellCapacity}</li>
                )}
              </ul>
              {occurrences.length > props.cellCapacity && (
                <ul className="month-full" aria-label={`${month}월 ${day}일 전체`}>
                  {occurrences.map(({ item, done }) => (
                    <li key={item.id}>
                      <button type="button" className={`month-item item-open ${done ? "is-done" : ""}`} onClick={() => props.onEdit(item)}>
                        <ItemMark category={categoryOf(item)} task={item.kind === "task"} done={done} />
                        <span className="month-item-time num">{startLabel(item.time)}</span>
                        <span className="month-item-title">{item.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function tabColorSlot(tab: CalendarTab | undefined, categories: Category[]): number {
  const firstId = tab?.categoryIds?.[0];

  return categories.find((c) => c.id === firstId)?.colorSlot ?? 0;
}

function toneOf(weekday: number, holiday: boolean): string {
  if (holiday || weekday === 0) {
    return "is-red";
  }

  return weekday === 6 ? "is-blue" : "";
}
