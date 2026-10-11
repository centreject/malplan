import { CalendarOff, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { IsoDate, Weekday } from "../domain/date";
import type { Category, Item } from "../domain/item";
import { groupRecurring, taskSections, type RecurringGroup, type TaskEntry } from "../domain/lists";
import { shortDate, timeLabel, weekdayName } from "./format";
import { CategoryTag } from "./parts";

type ListPageProps = {
  items: Item[];
  categories: Category[];
  today: IsoDate;
  weekStart: Weekday;
  onEdit: (item: Item, date?: IsoDate) => void;
  onToggle: (item: Item, date: string) => void;
  onEndSeries: (item: Item) => void;
  onDelete: (item: Item) => void;
  onAddRecurring: () => void;
};

type ListTab = "tasks" | "recurring";

/** Full-page lists: every task by section, and recurring items grouped by the day they happen. */
export function ListPage(props: ListPageProps) {
  const [tab, setTab] = useState<ListTab>("tasks");

  return (
    <section className="pane list-page" aria-label="목록">
      <header className="pane-head">
        <h2 className="pane-title">목록</h2>
        <div className="tabs" role="tablist" aria-label="목록 종류">
          <button type="button" role="tab" className="tab cat-0" aria-selected={tab === "tasks"} onClick={() => setTab("tasks")}>
            모든 할 일
          </button>
          <button type="button" role="tab" className="tab cat-0" aria-selected={tab === "recurring"} onClick={() => setTab("recurring")}>
            주기적 일정
          </button>
        </div>
      </header>
      <div className="pane-body list-body">{tab === "tasks" ? <TaskList {...props} /> : <RecurringList {...props} />}</div>
    </section>
  );
}

function TaskList({ items, categories, today, onEdit, onToggle }: ListPageProps) {
  const sections = taskSections(items, today);
  const categoryOf = (item: Item) => categories.find((c) => c.id === item.categoryId);

  const rows = (entries: TaskEntry[], tone: string, done: boolean) => (
    <ul className="list-rows">
      {entries.map(({ item, date }) => (
        <li key={`${item.id}@${date ?? ""}`} className={`list-row ${tone}`}>
          <button
            type="button"
            className="check"
            aria-pressed={done}
            aria-label={done ? `${item.title} 완료 취소` : `${item.title} 완료`}
            onClick={() => onToggle(item, date ?? "done")}
          >
            {done && <Check size={14} strokeWidth={3} />}
          </button>
          <span className="list-date num">{date === undefined ? "—" : `${shortDate(date)} ${weekdayName(date)}`}</span>
          <button type="button" className="list-title item-open" onClick={() => onEdit(item, date)}>
            {item.title}
            <span className="list-sub">{timeLabel(item.time)}</span>
          </button>
          <CategoryTag category={categoryOf(item)} />
        </li>
      ))}
    </ul>
  );

  const total = sections.overdue.length + sections.today.length + sections.upcoming.length + sections.undated.length;

  return (
    <>
      {total === 0 && <p className="empty">남은 할 일이 없습니다.</p>}
      {sections.overdue.length > 0 && (
        <section className="list-section">
          <h3>밀린 할 일 <span className="count num">{sections.overdue.length}</span></h3>
          {rows(sections.overdue, "is-late", false)}
        </section>
      )}
      {sections.today.length > 0 && (
        <section className="list-section">
          <h3>오늘 <span className="count num">{sections.today.length}</span></h3>
          {rows(sections.today, "", false)}
        </section>
      )}
      {sections.upcoming.length > 0 && (
        <section className="list-section">
          <h3>예정 <span className="count num">{sections.upcoming.length}</span></h3>
          {rows(sections.upcoming, "", false)}
        </section>
      )}
      {sections.undated.length > 0 && (
        <section className="list-section">
          <h3>날짜 없는 할 일 <span className="count num">{sections.undated.length}</span></h3>
          {rows(sections.undated, "", false)}
        </section>
      )}
      {sections.done.length > 0 && (
        <details className="list-section side-list">
          <summary>완료한 할 일 <span className="count num">{sections.done.length}</span></summary>
          {rows(sections.done, "is-done", true)}
        </details>
      )}
    </>
  );
}

function RecurringList({ items, categories, today, weekStart, onEdit, onEndSeries, onDelete, onAddRecurring }: ListPageProps) {
  const active = groupRecurring(items, today, weekStart);
  const ended = groupRecurring(items, today, weekStart, true);
  const categoryOf = (item: Item) => categories.find((c) => c.id === item.categoryId);

  const groupList = (groups: RecurringGroup[], finished: boolean) =>
    groups.map((group) => (
      <section key={group.key} className="list-section">
        <h3>{group.label} <span className="count num">{group.entries.length}</span></h3>
        <ul className="list-rows">
          {group.entries.map(({ item, rule, next }) => (
            <li key={item.id} className={`list-row recurring-row ${finished ? "is-past" : ""}`}>
              <span className="list-date">{rule}</span>
              <button type="button" className="list-title item-open" onClick={() => onEdit(item, next)}>
                {item.title}
                <span className="list-sub">
                  {timeLabel(item.time)}
                  {next !== undefined && ` · 다음 ${shortDate(next)} ${weekdayName(next)}`}
                  {item.kind === "event" && " · 일정"}
                </span>
              </button>
              <CategoryTag category={categoryOf(item)} />
              <span className="row-actions">
                <button type="button" className="icon-button" aria-label={`${item.title} 수정`} title="수정" onClick={() => onEdit(item)}>
                  <Pencil size={16} strokeWidth={2} />
                </button>
                {!finished && (
                  <button type="button" className="icon-button" aria-label={`${item.title} 반복 끝내기`} title="오늘까지만 반복" onClick={() => onEndSeries(item)}>
                    <CalendarOff size={16} strokeWidth={2} />
                  </button>
                )}
                <button type="button" className="icon-button" aria-label={`${item.title} 삭제`} title="삭제" onClick={() => onDelete(item)}>
                  <Trash2 size={16} strokeWidth={2} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    ));

  return (
    <>
      <div className="storage-actions list-actions">
        <button type="button" className="text-button bordered" onClick={onAddRecurring}>
          <Plus size={16} strokeWidth={2} /> 주기적 일정 추가
        </button>
        <span className="window-note">같은 날에 하는 것끼리 묶었습니다. 여러 요일에 하는 항목은 요일마다 보입니다.</span>
      </div>
      {active.length === 0 && <p className="empty">주기적 일정이 없습니다. 예: "매주 수요일 오후 4시 우편물 발송"</p>}
      {groupList(active, false)}
      {ended.length > 0 && (
        <details className="side-list">
          <summary>끝난 반복 <span className="count num">{ended.flatMap((g) => g.entries).length}</span></summary>
          {groupList(ended, true)}
        </details>
      )}
    </>
  );
}
