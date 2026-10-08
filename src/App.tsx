import { useEffect, useMemo, useState } from "react";
import { addDays, partsOf, type IsoDate, type Weekday } from "./domain/date";
import type { Item } from "./domain/item";
import { holidaysForYears } from "./domain/holidays";
import { overdueTasks, weekDates } from "./domain/schedule";
import { MonthPane, type CalendarTab } from "./ui/MonthPane";
import { SAMPLE_CATEGORIES, sampleItems } from "./ui/sampleData";
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

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    saveTheme(theme);
  }, [theme]);

  const tab = INITIAL_TABS.find((t) => t.id === activeTab);

  const visible = tab?.categoryIds === undefined
    ? items
    : items.filter((item) => tab.categoryIds?.includes(item.categoryId));

  const todayMonth = partsOf(now.today);

  // Every year any pane can show (adjacent-month cells included), so navigation never loses holidays.
  const holidayYears = [...new Set([now.today, selected, weekAnchor].map((date) => partsOf(date).year).concat(monthCursor.year))]
    .flatMap((year) => [year - 1, year, year + 1])
    .join(",");

  const holidays = useMemo(() => holidaysForYears(holidayYears.split(",").map(Number)), [holidayYears]);
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
      <TopBar today={now.today} onSettings={() => setSettingsOpen(true)} />
      <main className="board">
        <TodayPane
          date={selected}
          isToday={selected === now.today}
          nowMinutes={now.minutes}
          items={visible}
          categories={SAMPLE_CATEGORIES}
          holiday={holidays.get(selected)}
          overdue={overdueTasks(visible, now.today)}
          undated={visible.filter((item) => item.when.kind === "none" && !item.done.includes("done"))}
          onToggle={toggleDone}
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
            categories={SAMPLE_CATEGORIES}
            holidays={holidays}
            onSelect={select}
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
            categories={SAMPLE_CATEGORIES}
            holidays={holidays}
            cellCapacity={theme === "desk" ? 2 : 3}
            tabs={INITIAL_TABS}
            activeTab={activeTab}
            onTab={setActiveTab}
            onSelect={select}
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
    </div>
  );
}
