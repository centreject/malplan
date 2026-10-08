import { partsOf, weekdayOf, type IsoDate } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { occurrencesOn } from "../domain/schedule";
import { shortDate, startLabel, weekdayName } from "./format";
import { ItemMark, PaneHeader } from "./parts";

const VISIBLE_PER_DAY = 5;

type WeekPaneProps = {
  dates: IsoDate[];
  today: IsoDate;
  selected: IsoDate;
  items: Item[];
  categories: Category[];
  holidays: Map<IsoDate, string>;
  onSelect: (date: IsoDate) => void;
  /** date = the occurrence clicked, when there is one. */
  onEdit: (item: Item, date?: IsoDate) => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: (() => void) | undefined;
};

export function WeekPane(props: WeekPaneProps) {
  const first = props.dates[0] ?? props.today;
  const last = props.dates.at(-1) ?? props.today;

  return (
    <section className="pane pane-week" aria-label="이번 주 할 일">
      <PaneHeader
        unit="주"
        resetLabel="이번 주"
        onPrev={props.onPrev}
        onNext={props.onNext}
        onReset={props.onReset}
        title={
          <>
            이번 주 <span className="pane-range num">{shortDate(first)} – {shortDate(last)}</span>
          </>
        }
      />
      <ol className="week-grid">
        {props.dates.map((date) => {
          const occurrences = occurrencesOn(props.items, date);
          const holiday = props.holidays.get(date);
          const tone = holiday !== undefined || weekdayOf(date) === 0 ? "is-red" : weekdayOf(date) === 6 ? "is-blue" : "";

          return (
            <li
              key={date}
              className={`week-day ${date === props.today ? "is-today" : ""} ${date === props.selected ? "is-selected" : ""}`}
            >
              <button type="button" className={`week-head ${tone}`} onClick={() => props.onSelect(date)}>
                <span className="week-weekday">{weekdayName(date)}</span>
                <span className="week-date num">{partsOf(date).day}</span>
              </button>
              {holiday !== undefined && <span className="week-holiday">{holiday}</span>}
              <ul className="week-items">
                {occurrences.slice(0, VISIBLE_PER_DAY).map(({ item, done }) => (
                  <li key={item.id}>
                    <button type="button" className={`week-item item-open ${done ? "is-done" : ""}`} onClick={() => props.onEdit(item, date)}>
                      <ItemMark
                        category={props.categories.find((c) => c.id === item.categoryId)}
                        task={item.kind === "task"}
                        done={done}
                      />
                      <span className="week-item-time num">{startLabel(item.time)}</span>
                      <span className="week-item-title">{item.title}</span>
                    </button>
                  </li>
                ))}
                {occurrences.length > VISIBLE_PER_DAY && (
                  <li className="week-more">+{occurrences.length - VISIBLE_PER_DAY}</li>
                )}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
