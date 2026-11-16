import { useContext } from "react";
import { ItemMenu } from "./ContextMenu";
import { addDays, partsOf, weekdayOf, type IsoDate } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { carriedInto, endsNextDay, formatClock, minutesOf, nextUp, occurrencesOn, sortKey, type Occurrence, type OverdueTask } from "../domain/schedule";
import { monthDay, shortDate, timeLabel, untilLabel, weekdayName } from "./format";
import { OverdueList } from "./OverdueList";
import { CategoryTag, CheckButton, PaneHeader } from "./parts";

type TodayPaneProps = {
  date: IsoDate;
  isToday: boolean;
  nowMinutes: number;
  items: Item[];
  categories: Category[];
  holiday: string | undefined;
  overdue: OverdueTask[];
  undated: Item[];
  onToggle: (item: Item, date: string) => void;
  /** date = the occurrence clicked, when there is one. */
  onEdit: (item: Item, date?: IsoDate) => void;
  /** The real today (the pane may show another day). */
  today: IsoDate;
  onReschedule: (ids: string[], target: IsoDate) => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: (() => void) | undefined;
};

export function TodayPane(props: TodayPaneProps) {
  const { date, isToday, nowMinutes, items, categories } = props;
  const occurrences = occurrencesOn(items, date);
  // Started the day before and still running after midnight: listed first, until they end.
  const carried = carriedInto(items, date);
  const untimed = occurrences.filter((o) => sortKey(o.item.time) < 0);
  const timed = occurrences.filter((o) => sortKey(o.item.time) >= 0);
  const next = isToday ? nextUp(items, date, nowMinutes) : undefined;
  const nowIndex = isToday ? timed.findIndex((o) => sortKey(o.item.time) >= nowMinutes) : -1;
  const categoryOf = (item: Item) => categories.find((c) => c.id === item.categoryId);
  const openMenu = useContext(ItemMenu);

  /** `continued`: the part after midnight of an item that started the day before. */
  const row = (occurrence: Occurrence, continued = false) => {
    const { item } = occurrence;
    const { time } = item;
    const end = time.kind === "exact" ? time.end : undefined;

    const started = continued
      ? isToday && end !== undefined && minutesOf(end) <= nowMinutes
      : isToday && sortKey(time) >= 0 && sortKey(time) < nowMinutes;

    const state = occurrence.done ? "is-done" : started ? (item.kind === "task" ? "is-late" : "is-past") : "";
    // The occurrence's own date, which for a continued item is the day before: that is what ticking and editing mean.
    const at = occurrence.date;

    return (
      <li key={`${continued ? "carried-" : ""}${item.id}`} className={`agenda-row ${state}`}>
        <span className="agenda-time num">
          {continued && end !== undefined ? (
            `~${formatClock(end)}`
          ) : endsNextDay(time) && end !== undefined ? (
            <>
              {time.kind === "exact" && formatClock(time.start)}–
              <br />
              다음 날 {formatClock(end)}
            </>
          ) : (
            timeLabel(time)
          )}
        </span>
        <span className="agenda-main">
          <button type="button" className="agenda-title item-open" onClick={() => props.onEdit(item, at)} onContextMenu={(event) => openMenu(event, item, at)}>{item.title}</button>
          {continued ? <span className="agenda-sub">전날부터{item.place !== undefined && ` · ${item.place}`}</span> : item.place !== undefined && <span className="agenda-sub">{item.place}</span>}
        </span>
        <CategoryTag category={categoryOf(item)} />
        {item.kind === "task" && <CheckButton title={item.title} done={occurrence.done} onToggle={() => props.onToggle(item, at)} />}
      </li>
    );
  };

  return (
    <section className="pane pane-today" aria-label="오늘 할 일">
      <PaneHeader
        unit="날"
        resetLabel="오늘"
        onPrev={props.onPrev}
        onNext={props.onNext}
        onReset={props.onReset}
        title={
          <span className="day-head">
            <span className={`day-num num ${props.holiday !== undefined || weekdayOf(date) === 0 ? "is-red" : ""}`}>{partsOf(date).day}</span>
            <span className="day-meta">
              <span className="day-weekday">{weekdayName(date)}요일</span>
              <span className="day-sub">
                {monthDay(date)}
                {props.holiday !== undefined && <span className="holiday-name"> · {props.holiday}</span>}
              </span>
            </span>
          </span>
        }
      />

      {next !== undefined && (
        <div className="next-plate" role="status">
          <span className="next-when num">{nextWhen(next.occurrence.date, date, next.minutesUntil)}</span>
          <span className="next-title">
            <CategoryTag category={categoryOf(next.occurrence.item)} />
            <span className="next-title-text">{next.occurrence.item.title}</span>
          </span>
          <span className="next-detail">
            {timeLabel(next.occurrence.item.time)}
            {next.occurrence.item.place !== undefined && ` · ${next.occurrence.item.place}`}
          </span>
        </div>
      )}

      <div className="pane-body">
        {occurrences.length === 0 && carried.length === 0 ? (
          <p className="empty">이 날은 일정이 없습니다. 위 입력창에 문장으로 적어 추가하세요.</p>
        ) : (
          <ol className="agenda">
            {carried.map((occurrence) => row(occurrence, true))}
            {untimed.map((occurrence) => row(occurrence))}
            {carried.length + untimed.length > 0 && timed.length > 0 && <li className="agenda-gap" aria-hidden="true" />}
            {timed.map((occurrence, index) => (
              <FragmentWithNow key={occurrence.item.id} showNow={index === nowIndex}>
                {row(occurrence)}
              </FragmentWithNow>
            ))}
            {isToday && nowIndex === -1 && timed.length > 0 && <NowLine />}
          </ol>
        )}

        <OverdueList
          overdue={props.overdue}
          today={props.today}
          categoryOf={categoryOf}
          onEdit={props.onEdit}
          onToggle={props.onToggle}
          onReschedule={props.onReschedule}
        />

        <details className="side-list">
          <summary>
            날짜 없는 할 일 <span className="count num">{props.undated.length}</span>
          </summary>
          <ul>
            {props.undated.map((item) => (
              <li key={item.id} className="side-row">
                <button type="button" className="side-title item-open" onClick={() => props.onEdit(item)} onContextMenu={(event) => openMenu(event, item)}>{item.title}</button>
                <CategoryTag category={categoryOf(item)} />
                <CheckButton title={item.title} done={false} onToggle={() => props.onToggle(item, "done")} />
              </li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}

function NowLine() {
  return (
    <li className="now-line" aria-label="현재 시각">
      <span>지금</span>
    </li>
  );
}

function FragmentWithNow({ showNow, children }: { showNow: boolean; children: React.ReactNode }) {
  return (
    <>
      {showNow && <NowLine />}
      {children}
    </>
  );
}

/** "12분 후" today, "내일" tomorrow, otherwise "10/8 목". */
function nextWhen(nextDate: IsoDate, today: IsoDate, minutesUntil: number): string {
  if (nextDate === today) {
    return untilLabel(minutesUntil);
  }

  return nextDate === addDays(today, 1) ? "내일" : `${shortDate(nextDate)} ${weekdayName(nextDate)}`;
}
