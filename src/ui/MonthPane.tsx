import { ListFilter, Pencil, Plus } from "lucide-react";
import { Fragment, useState } from "react";
import { partsOf, weekdayOf, type IsoDate, type Weekday } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { monthCells, occurrencesOn } from "../domain/schedule";
import { ALL_TAB_ID, type CalendarTab } from "../domain/tabs";
import { WEEKDAY_NAMES, startLabel } from "./format";
import { ItemMark, PaneHeader } from "./parts";
import { CategoryChecklist } from "./TabEditor";

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
  onAddTab: () => void;
  onEditTab: (id: string) => void;
  onMoveTab: (id: string, index: number) => void;
  /** Temporary category filter on 전체; undefined = every category. */
  allFilter: string[] | undefined;
  onAllFilter: (ids: string[] | undefined) => void;
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
  const [dragged, setDragged] = useState<string>();

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
          {props.tabs.map((t, index) => (
            <Fragment key={t.id}>
              <button
                type="button"
                role="tab"
                aria-selected={t.id === props.activeTab}
                className={`tab cat-${tabColorSlot(t, props.categories)}`}
                draggable={t.id !== ALL_TAB_ID}
                onClick={() => props.onTab(t.id)}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", t.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragged(t.id);
                }}
                onDragEnd={() => setDragged(undefined)}
                onDragOver={(event) => {
                  if (dragged !== undefined) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  if (dragged !== undefined) {
                    props.onMoveTab(dragged, index);
                  }
                }}
              >
                {t.name}
              </button>
              {t.id === props.activeTab && t.id !== ALL_TAB_ID && (
                <button
                  type="button"
                  className="tab tab-icon"
                  onClick={() => props.onEditTab(t.id)}
                  aria-label={`'${t.name}' 탭 편집`}
                  title="탭 편집"
                >
                  <Pencil size={14} strokeWidth={2} />
                </button>
              )}
              {t.id === props.activeTab && t.id === ALL_TAB_ID && (
                <>
                  <button
                    type="button"
                    className={`tab tab-icon tab-filter ${props.allFilter === undefined ? "" : "is-filtering"}`}
                    popoverTarget="all-filter"
                    aria-label={
                      props.allFilter === undefined ? "분류 필터" : `분류 필터 (${props.allFilter.length}개 표시 중)`
                    }
                    title="분류 필터"
                  >
                    <ListFilter size={14} strokeWidth={2} />
                  </button>
                  <div id="all-filter" className="all-filter" popover="auto">
                    <CategoryChecklist
                      categories={props.categories}
                      selected={props.allFilter ?? props.categories.map((c) => c.id)}
                      onChange={(ids) =>
                        props.onAllFilter(ids.length === props.categories.length ? undefined : ids)
                      }
                    />
                  </div>
                </>
              )}
            </Fragment>
          ))}
          <button type="button" className="tab tab-icon" aria-label="탭 추가" title="탭 추가" onClick={props.onAddTab}>
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
