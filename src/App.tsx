import { useEffect, useState } from "react";
import { cardFromItem, cardFromParse, commitCards, splitInput, type Draft } from "./domain/card";
import { addDays, partsOf, type IsoDate, type Weekday } from "./domain/date";
import type { Category, Item } from "./domain/item";
import { overdueTasks, weekDates } from "./domain/schedule";
import { parseKorean } from "./parse/parseKorean";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { MonthPane, type CalendarTab } from "./ui/MonthPane";
import { SAMPLE_CATEGORIES, SAMPLE_HOLIDAYS, sampleItems } from "./ui/sampleData";
import { loadTheme, saveTheme, type ThemeId } from "./ui/themes";
import { SettingsDialog } from "./ui/SettingsDialog";
import { TodayPane } from "./ui/TodayPane";
import { TopBar } from "./ui/TopBar";
import { useNow } from "./ui/useNow";
import { WeekPane } from "./ui/WeekPane";
import "./styles.css";

const WEEK_START: Weekday = 0;

const INITIAL_TABS: CalendarTab[] = [
  { id: "all", name: "전체", categoryIds: undefined },
  { id: "school", name: "학교", categoryIds: ["school", "contest"] },
  { id: "work", name: "회사", categoryIds: ["work"] },
];

type MonthCursor = { year: number; month: number };

function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const index = cursor.year * 12 + (cursor.month - 1) + delta;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export default function App() {
  const now = useNow();
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  const [items, setItems] = useState<Item[]>(() => sampleItems(now.today));
  const [selected, setSelected] = useState<IsoDate>(now.today);
  const [weekAnchor, setWeekAnchor] = useState<IsoDate>(now.today);
  const [monthCursor, setMonthCursor] = useState<MonthCursor>(() => partsOf(now.today));
  const [activeTab, setActiveTab] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>(SAMPLE_CATEGORIES);
  const [quickText, setQuickText] = useState("");
  const [confirm, setConfirm] = useState<{ drafts: Draft[]; editing: boolean }>();

  const openNew = () => {
    const drafts = splitInput(quickText).map((part) => ({
      id: crypto.randomUUID(),
      card: cardFromParse(parseKorean(part, now.today), now.today, categories),
    }));

    setConfirm({ drafts, editing: false });
  };

  const openEdit = (item: Item) => {
    setConfirm({ drafts: [{ id: item.id, card: cardFromItem(item, now.today) }], editing: true });
  };

  const saveDrafts = (drafts: Draft[]) => {
    const result = commitCards(drafts, items, categories, () => crypto.randomUUID());

    setItems(result.items);
    setCategories(result.categories);

    if (confirm?.editing === false) {
      setQuickText("");
    }

    setConfirm(undefined);
  };

  const deleteItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setConfirm(undefined);
  };

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    saveTheme(theme);
  }, [theme]);

  const tab = INITIAL_TABS.find((t) => t.id === activeTab);

  const visible = tab?.categoryIds === undefined
    ? items
    : items.filter((item) => tab.categoryIds?.includes(item.categoryId));

  const todayMonth = partsOf(now.today);
  const isCurrentMonth = monthCursor.year === todayMonth.year && monthCursor.month === todayMonth.month;
  const week = weekDates(weekAnchor, WEEK_START);

  const select = (date: IsoDate) => {
    setSelected(date);
    setWeekAnchor(date);
  };

  const toggleDone = (target: Item, date: string) => {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== target.id) {
          return item;
        }

        const done = item.done.includes(date)
          ? item.done.filter((d) => d !== date)
          : [...item.done, date];

        return { ...item, done };
      }),
    );
  };

  return (
    <div className="app">
      <TopBar
        today={now.today}
        text={quickText}
        onText={setQuickText}
        onSubmit={openNew}
        onSettings={() => setSettingsOpen(true)}
      />
      <main className="board">
        <TodayPane
          date={selected}
          isToday={selected === now.today}
          nowMinutes={now.minutes}
          items={visible}
          categories={categories}
          holiday={SAMPLE_HOLIDAYS.get(selected)}
          overdue={overdueTasks(visible, now.today)}
          undated={visible.filter((item) => item.when.kind === "none" && !item.done.includes("done"))}
          onToggle={toggleDone}
          onEdit={openEdit}
          onPrev={() => select(addDays(selected, -1))}
          onNext={() => select(addDays(selected, 1))}
          onReset={selected === now.today ? undefined : () => select(now.today)}
        />
        <div className="board-side">
          <WeekPane
            dates={week}
            today={now.today}
            selected={selected}
            items={visible}
            categories={categories}
            holidays={SAMPLE_HOLIDAYS}
            onSelect={select}
            onEdit={openEdit}
            onPrev={() => setWeekAnchor(addDays(weekAnchor, -7))}
            onNext={() => setWeekAnchor(addDays(weekAnchor, 7))}
            onReset={week.includes(now.today) ? undefined : () => setWeekAnchor(now.today)}
          />
          <MonthPane
            year={monthCursor.year}
            month={monthCursor.month}
            weekStart={WEEK_START}
            today={now.today}
            selected={selected}
            items={visible}
            categories={categories}
            holidays={SAMPLE_HOLIDAYS}
            cellCapacity={theme === "desk" ? 2 : 3}
            tabs={INITIAL_TABS}
            activeTab={activeTab}
            onTab={setActiveTab}
            onSelect={select}
            onEdit={openEdit}
            onPrev={() => setMonthCursor(shiftMonth(monthCursor, -1))}
            onNext={() => setMonthCursor(shiftMonth(monthCursor, 1))}
            onReset={isCurrentMonth ? undefined : () => setMonthCursor(todayMonth)}
          />
        </div>
      </main>
      <SettingsDialog
        open={settingsOpen}
        theme={theme}
        onTheme={setTheme}
        onClose={() => setSettingsOpen(false)}
      />
      {confirm !== undefined && (
        <ConfirmDialog
          drafts={confirm.drafts}
          editing={confirm.editing}
          categories={categories}
          onConfirm={saveDrafts}
          onDelete={deleteItem}
          onCancel={() => setConfirm(undefined)}
        />
      )}
    </div>
  );
}
