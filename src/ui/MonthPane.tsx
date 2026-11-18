import { ChevronDown, Plus } from "lucide-react";
import { Fragment, useContext, useEffect, useRef, useState, type MouseEvent, type RefObject } from "react";
import { DayMenu, ItemMenu } from "./ContextMenu";
import { partsOf, weekdayOf, type IsoDate, type Weekday } from "../domain/date";
import { categoryClass } from "../domain/categories";
import type { Category, Item } from "../domain/item";
import { monthCells, occurrencesOn } from "../domain/schedule";
import { ALL_TAB_ID, type CalendarTab } from "../domain/tabs";
import { WEEKDAY_NAMES, startLabel } from "./format";
import { ItemMark, PaneHeader } from "./parts";
import { MonthPicker } from "./MonthPicker";
import { CategoryChecklist } from "./TabEditor";
import { droppedItem, isItemDrag, startDrag } from "./dragItem";

type MonthPaneProps = {
  year: number;
  month: number;
  weekStart: Weekday;
  today: IsoDate;
  selected: IsoDate;
  items: Item[];
  categories: Category[];
  holidays: Map<IsoDate, string>;
  /** Items listed per cell before "+n". */
  cellCapacity: number;
  tabs: CalendarTab[];
  activeTab: string;
  onTab: (id: string) => void;
  onAddTab: () => void;
  onEditTab: (id: string) => void;
  /** Right-click on a tab other than 전체. */
  onTabMenu: (event: MouseEvent, id: string) => void;
  onMoveTab: (id: string, index: number) => void;
  /** Temporary category filter on 전체; undefined = every category. */
  allFilter: string[] | undefined;
  onAllFilter: (ids: string[] | undefined) => void;
  onAddCategory: (name: string) => string | undefined;
  onSelect: (date: IsoDate) => void;
  /** date = the occurrence clicked, when there is one. */
  onEdit: (item: Item, date?: IsoDate) => void;
  /** An item dragged from the day `from` and dropped on `to`. */
  onMove: (id: string, from: IsoDate, to: IsoDate) => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: (() => void) | undefined;
  /** A month chosen from the title's year/month picker. */
  onPickMonth: (year: number, month: number) => void;
};

export function MonthPane(props: MonthPaneProps) {
  const cells = monthCells(props.year, props.month, props.weekStart);
  const headers = Array.from({ length: 7 }, (_, index) => (props.weekStart + index) % 7);
  const tab = props.tabs.find((t) => t.id === props.activeTab);
  const tabColor = tabClass(tab, props.categories);
  const categoryOf = (item: Item) => props.categories.find((c) => c.id === item.categoryId);
  const [dragged, setDragged] = useState<string>();
  const openMenu = useContext(ItemMenu);
  const openDayMenu = useContext(DayMenu);
  const grid = useRef<HTMLDivElement>(null);
  const rows = useRowsThatFit(grid);
  const limit = Math.min(props.cellCapacity, rows ?? props.cellCapacity);
  // A crowded day's full list: pointing at "+n" shows it until the pointer leaves the list; clicking the day pins it
  // until the day is clicked again, somewhere else is clicked, or Escape. The same rules as the missed-dates popup.
  const [pinned, setPinned] = useState<IsoDate>();
  const [hovered, setHovered] = useState<IsoDate>();
  /** The day an item is being dragged over. */
  const [dropOn, setDropOn] = useState<IsoDate>();

  useEffect(() => {
    if (pinned === undefined) {
      return;
    }

    const unpin = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest(`[data-date="${pinned}"]`))) {
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

  return (
    <section className={`pane pane-month tab-frame ${tabColor}`} aria-label="이번 달 할 일">
      <PaneHeader
        unit="달"
        resetLabel="이번 달"
        onPrev={props.onPrev}
        onNext={props.onNext}
        onReset={props.onReset}
        title={<MonthPicker year={props.year} month={props.month} today={props.today} onPick={props.onPickMonth} />}
      >
        <div className="tabs" role="tablist" aria-label="달력 탭">
          {props.tabs.map((t, index) => (
            <Fragment key={t.id}>
              <button
                type="button"
                role="tab"
                aria-selected={t.id === props.activeTab}
                className={`tab ${tabClass(t, props.categories)} ${t.id === ALL_TAB_ID ? "tab-filter" : ""} ${t.id === ALL_TAB_ID && props.allFilter !== undefined ? "is-filtering" : ""}`}
                draggable={t.id !== ALL_TAB_ID}
                // 전체 already selected: a second click opens the category filter. Other tabs: double-click or right-click to edit.
                popoverTarget={t.id === ALL_TAB_ID ? "all-filter" : undefined}
                // The full name too: the tab cuts a long one.
                title={t.id === ALL_TAB_ID ? "한 번 더 누르면 분류 필터" : `${t.name} · 더블클릭하거나 우클릭하여 편집`}
                onClick={(event) => {
                  // Coming back to 전체 from another tab only selects it. Setting popoverTarget once selected was
                  // too late: the same click re-rendered first and then opened the filter.
                  if (t.id === ALL_TAB_ID && t.id !== props.activeTab) {
                    event.preventDefault();
                  }

                  props.onTab(t.id);
                }}
                onContextMenu={(event) => {
                  if (t.id !== ALL_TAB_ID) {
                    props.onTabMenu(event, t.id);
                  }
                }}
                onDoubleClick={() => {
                  if (t.id !== ALL_TAB_ID) {
                    props.onEditTab(t.id);
                  }
                }}
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
                {t.id === ALL_TAB_ID && <ChevronDown className="tab-chevron" size={14} strokeWidth={2} aria-hidden="true" />}
              </button>
              {t.id === ALL_TAB_ID && (
                <>
                  <div id="all-filter" className="all-filter" popover="auto">
                    <CategoryChecklist
                      categories={props.categories}
                      selected={props.allFilter ?? props.categories.map((c) => c.id)}
                      // Every category checked (a just-added one included) is no filter at all.
                      onChange={(ids) => props.onAllFilter(props.categories.every((c) => ids.includes(c.id)) ? undefined : ids)}
                      onAdd={props.onAddCategory}
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

      <div ref={grid} className="month-grid" role="grid" aria-label={`${props.year}년 ${props.month}월`}>
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
                occurrences.length > limit && (date === pinned || date === hovered) ? "is-unfolded" : "",
                date === dropOn ? "is-drop" : "",
              ].join(" ")}
              data-date={date}
              onContextMenu={(event) => openDayMenu(event, date)}
              onDragOver={(event) => {
                if (isItemDrag(event)) {
                  event.preventDefault();
                  setDropOn(date);
                }
              }}
              onDragLeave={(event) => {
                // Into a child of this day is still over it.
                if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) setDropOn(undefined);
              }}
              onDrop={(event) => {
                const item = droppedItem(event);

                setDropOn(undefined);

                if (item !== undefined) {
                  event.preventDefault();
                  props.onMove(item.id, item.date, date);
                }
              }}
              // The list is inside the cell, so this fires only once the pointer leaves both (and the list's margin).
              onMouseLeave={() => setHovered(undefined)}
              onClick={() => {
                props.onSelect(date);

                if (occurrences.length > limit) {
                  setPinned((current) => (current === date ? undefined : date));
                }
              }}
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
                {occurrences.slice(0, limit).map(({ item, done }, index) => (
                  <li key={item.id} className="month-row">
                    <button
                      type="button"
                      className={`month-item item-open ${done ? "is-done" : ""}`}
                      draggable
                      onDragStart={(event) => startDrag(event, item.id, date)}
                      onClick={() => props.onEdit(item, date)}
                      onContextMenu={(event) => openMenu(event, item, date)}
                    >
                      <ItemMark category={categoryOf(item)} task={item.kind === "task"} done={done} />
                      <span className="month-item-title">{item.title}</span>
                    </button>
                    {/* "+n" ends the last row it continues, so it reads as "and n more". */}
                    {index === limit - 1 && occurrences.length > limit && (
                      <span className="month-more" onMouseEnter={() => setHovered(date)} aria-label={`외 ${occurrences.length - limit}개`}>+{occurrences.length - limit}</span>
                    )}
                  </li>
                ))}
              </ul>
              {occurrences.length > limit && (
                <ul className="month-full" aria-label={`${month}월 ${day}일 전체`}>
                  {occurrences.map(({ item, done }) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`month-item item-open ${done ? "is-done" : ""}`}
                        draggable
                        onDragStart={(event) => startDrag(event, item.id, date)}
                        onClick={() => props.onEdit(item, date)}
                        onContextMenu={(event) => openMenu(event, item, date)}
                      >
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

/** A tab takes its first category's colour; 전체 stays neutral. */
function tabClass(tab: CalendarTab | undefined, categories: Category[]): string {
  const firstId = tab?.categoryIds?.[0];

  return categoryClass(categories.find((c) => c.id === firstId));
}

function toneOf(weekday: number, holiday: boolean): string {
  if (holiday || weekday === 0) {
    return "is-red";
  }

  return weekday === 6 ? "is-blue" : "";
}

/**
 * How many item rows fit in a month cell at the current window size and text size.
 * A fixed count cut the last row in half on short windows and hid the "+n" line.
 */
function useRowsThatFit(grid: RefObject<HTMLDivElement | null>): number | undefined {
  const [rows, setRows] = useState<number>();

  useEffect(() => {
    const element = grid.current;

    if (element === null) {
      return undefined;
    }

    const measure = () => setRows(rowsIn(element));
    const resized = new ResizeObserver(measure);
    // A row height needs a rendered item, so measure again when the month or its items change.
    const changed = new MutationObserver(measure);

    resized.observe(element);
    changed.observe(element, { childList: true, subtree: true });

    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, [grid]);

  return rows;
}

const ROW_GAP_PX = 2;

function rowsIn(grid: HTMLElement): number | undefined {
  const cell = grid.querySelector<HTMLElement>(".month-cell");
  const head = cell?.querySelector<HTMLElement>(".month-head");
  const row = grid.querySelector<HTMLElement>(".month-items li");

  if (cell === null || head === null || head === undefined || row === null) {
    return undefined;
  }

  const style = getComputedStyle(cell);
  const free = cell.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom) - head.offsetHeight - ROW_GAP_PX;

  return Math.max(1, Math.floor((free + ROW_GAP_PX) / (row.offsetHeight + ROW_GAP_PX)));
}

