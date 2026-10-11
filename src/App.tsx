import { useEffect, useMemo, useRef, useState } from "react";
import { NEW_CATEGORY, cardFromItem, cardFromParse, commitCards, splitInput, type Draft } from "./domain/card";
import { addCorrections, loadCorrections } from "./llm/corrections";
import { buildPrompt, parseExtraction, type Extraction } from "./llm/extract";
import { complete, loadLlmSettings, saveLlmSettings } from "./llm/providers";
import { AiSettings } from "./ui/AiSettings";
import { addDays, partsOf, type IsoDate } from "./domain/date";
import type { Category, Item } from "./domain/item";
import { holidaysForYears, mergeHolidays } from "./domain/holidays";
import { reschedule } from "./domain/reschedule";
import { deleteOccurrence, editOccurrence, type SeriesScope } from "./domain/series";
import { daysAround, overdueTasks } from "./domain/schedule";
import { parseKorean } from "./parse/parseKorean";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { addCategory, customColorCss, deleteCategory, recolorCategory, renameCategory, setCustomColor } from "./domain/categories";
import { ALL_TAB_ID, addTab, deleteTab, moveTab, updateTab, type CalendarTab } from "./domain/tabs";
import { CategorySettings } from "./ui/CategorySettings";
import { MonthPane } from "./ui/MonthPane";
import { SAMPLE_CATEGORIES, sampleItems } from "./ui/sampleData";
import { BackupSettings } from "./ui/BackupSettings";
import { HolidaySettings } from "./ui/HolidaySettings";
import { loadApiKey, saveApiKey, useSpecialDays } from "./ui/specialDays";
import { DisplaySettings, loadDisplay, saveDisplay } from "./ui/DisplaySettings";
import { NotificationSettings } from "./ui/NotificationSettings";
import { loadNotificationSettings, saveNotificationSettings, useReminders } from "./ui/notifications";
import { SearchDialog } from "./ui/SearchDialog";
import { StorageSettings } from "./ui/StorageSettings";
import { TabEditor } from "./ui/TabEditor";
import { useBoard } from "./ui/useBoard";
import type { Board } from "./storage/board";
import { loadTheme, saveTheme, type ThemeId } from "./ui/themes";
import { SettingsDialog } from "./ui/SettingsDialog";
import { TodayPane } from "./ui/TodayPane";
import { TopBar } from "./ui/TopBar";
import { useNow } from "./ui/useNow";
import { WeekPane } from "./ui/WeekPane";
import "./styles.css";

const ALL_TAB: CalendarTab = { id: ALL_TAB_ID, name: "전체", categoryIds: undefined };

/** First run: default categories. The dev build also gets synthetic items and example tabs. */
function firstBoard(today: IsoDate) {
  return import.meta.env.DEV
    ? {
        items: sampleItems(today),
        categories: SAMPLE_CATEGORIES,
        tabs: [
          ALL_TAB,
          { id: "school", name: "학교", categoryIds: ["school", "contest"] },
          { id: "work", name: "회사", categoryIds: ["work"] },
        ],
      }
    : { items: [], categories: SAMPLE_CATEGORIES, tabs: [ALL_TAB] };
}

/** How long the undo toast stays. */
const UNDO_MS = 8000;

type MonthCursor = { year: number; month: number };

type AiState = { extractions: Map<string, Extraction>; inputs: Map<string, string>; note: string | undefined };

function shiftMonth(cursor: MonthCursor, delta: number): MonthCursor {
  const index = cursor.year * 12 + (cursor.month - 1) + delta;

  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export default function App() {
  const now = useNow();
  const [theme, setTheme] = useState<ThemeId>(loadTheme);
  const persisted = useBoard(() => firstBoard(now.today));
  const { items, categories, tabs } = persisted.board;
  const setItems = (change: (current: Item[]) => Item[]) => persisted.update((b) => ({ ...b, items: change(b.items) }));
  const setCategories = (next: Category[]) => persisted.update((b) => ({ ...b, categories: next }));
  const setTabs = (next: CalendarTab[]) => persisted.update((b) => ({ ...b, tabs: next }));
  const [notifications, setNotifications] = useState(loadNotificationSettings);
  const [display, setDisplay] = useState(loadDisplay);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useReminders(items, now, notifications);

  const [selected, setSelected] = useState<IsoDate>(now.today);
  const [weekAnchor, setWeekAnchor] = useState<IsoDate>(now.today);
  const [monthCursor, setMonthCursor] = useState<MonthCursor>(() => partsOf(now.today));
  const [activeTab, setActiveTab] = useState(ALL_TAB_ID);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [allFilter, setAllFilter] = useState<string[]>();
  /** Tab being edited: an id, "new", or undefined when the editor is closed. */
  const [editing, setEditing] = useState<string>();
  const [quickText, setQuickText] = useState("");
  const [confirm, setConfirm] = useState<{ drafts: Draft[]; editing: boolean; occurrence?: IsoDate | undefined }>();

  const [llm, setLlm] = useState(loadLlmSettings);
  const [ai, setAi] = useState<AiState>({ extractions: new Map(), inputs: new Map(), note: undefined });
  /** Bumped per dialog so late AI answers for a closed dialog are dropped. */
  const aiSession = useRef(0);

  const openNew = () => {
    const parts = splitInput(quickText).map((part) => ({ part, id: crypto.randomUUID() }));
    const drafts = parts.map(({ part, id }) => ({ id, card: cardFromParse(parseKorean(part, now.today), now.today, categories) }));
    const session = ++aiSession.current;

    setConfirm({ drafts, editing: false });
    setAi({
      extractions: new Map(),
      inputs: new Map(parts.map(({ part, id }) => [id, part])),
      note: llm.provider === "off" ? undefined : "AI가 제목·분류·장소를 정리하는 중…",
    });

    if (llm.provider === "off") {
      return;
    }

    void Promise.all(
      parts.map(async ({ part, id }) => {
        const reply = await complete(llm, buildPrompt(part, categories, loadCorrections(), now.today));
        const extraction = parseExtraction(reply);

        if (extraction !== undefined && aiSession.current === session) {
          setAi((current) => ({ ...current, extractions: new Map(current.extractions).set(id, extraction) }));
        }
      }),
    )
      .then(() => {
        if (aiSession.current === session) {
          setAi((current) => ({ ...current, note: undefined }));
        }
      })
      .catch((error: Error) => {
        if (aiSession.current === session) {
          const note = llm.provider === "local"
            ? "로컬 AI 모델이 아직 준비되지 않아 규칙 기반으로만 정리했습니다."
            : `AI 정리 실패 (${error.message}). 규칙 기반 결과를 확인하세요.`;

          setAi((current) => ({ ...current, note }));
        }
      });
  };

  const openEdit = (item: Item, date?: IsoDate) => {
    const occurrence = item.when.kind === "recurring" ? date : undefined;

    setConfirm({ drafts: [{ id: item.id, card: cardFromItem(item, now.today) }], editing: true, occurrence });
  };

  const [undo, setUndo] = useState<{ label: string; board: Board }>();

  useEffect(() => {
    if (undo === undefined) {
      return;
    }

    const timer = window.setTimeout(() => setUndo(undefined), UNDO_MS);

    return () => window.clearTimeout(timer);
  }, [undo]);

  /** Remember the board before a change so the toast can restore it. */
  const remember = (label: string) => setUndo({ label, board: persisted.board });

  const saveDrafts = (drafts: Draft[], scope: SeriesScope) => {
    // Learn from category fixes: what the AI proposed vs what the user kept.
    addCorrections(
      drafts.flatMap((draft) => {
        const proposed = ai.extractions.get(draft.id)?.category;
        const input = ai.inputs.get(draft.id);

        const kept = draft.card.categoryId === NEW_CATEGORY
          ? draft.card.newCategory
          : categories.find((c) => c.id === draft.card.categoryId)?.name;

        return proposed !== undefined && input !== undefined && kept !== undefined && kept !== proposed
          ? [{ input, category: kept }]
          : [];
      }),
    );
    remember(confirm?.editing === true ? "수정했습니다" : `${drafts.length}개 추가했습니다`);
    const result = commitCards(drafts, items, categories, () => crypto.randomUUID());
    const original = items.find((item) => item.id === drafts[0]?.id);
    const edited = result.items.find((item) => item.id === original?.id);
    const occurrence = confirm?.occurrence;

    setItems(() =>
      original !== undefined && edited !== undefined && occurrence !== undefined
        ? editOccurrence(items, original, edited, occurrence, scope, () => crypto.randomUUID())
        : result.items,
    );
    setCategories(result.categories);

    if (confirm?.editing === false) {
      setQuickText("");
    }

    setConfirm(undefined);
  };

  const deleteItem = (id: string, scope: SeriesScope) => {
    remember("삭제했습니다");
    const original = items.find((item) => item.id === id);
    const occurrence = confirm?.occurrence;

    setItems((current) =>
      original !== undefined && occurrence !== undefined
        ? deleteOccurrence(current, original, occurrence, scope)
        : current.filter((item) => item.id !== id),
    );
    setConfirm(undefined);
  };

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
    saveTheme(theme);
  }, [theme]);

  const tab = tabs.find((t) => t.id === activeTab);
  const shownIds = tab?.categoryIds ?? allFilter;

  const visible = shownIds === undefined
    ? items
    : items.filter((item) => shownIds.includes(item.categoryId));

  const editedTab = tabs.find((t) => t.id === editing);

  const chooseTab = (id: string) => {
    setActiveTab(id);
    setAllFilter(undefined);
  };

  const removeCategory = (id: string) => {
    remember("분류를 삭제했습니다");
    const result = deleteCategory(categories, tabs, items, id);

    setCategories(result.categories);
    setTabs(result.tabs);
    setItems(() => result.items);
  };

  const todayMonth = partsOf(now.today);

  // Every year any pane can show (adjacent-month cells included), so navigation never loses holidays.
  const holidayYears = [...new Set([now.today, selected, weekAnchor].map((date) => partsOf(date).year).concat(monthCursor.year))]
    .flatMap((year) => [year - 1, year, year + 1])
    .join(",");

  const [holidayKey, setHolidayKey] = useState(loadApiKey);
  const thisYear = partsOf(now.today).year;
  // Re-checked at most once a day: the day's start is the clock the hook sees.
  const special = useSpecialDays(holidayKey, [thisYear, thisYear + 1], Date.parse(now.today));

  const holidays = useMemo(
    () => mergeHolidays(holidaysForYears(holidayYears.split(",").map(Number)), special.supplement),
    [holidayYears, special.supplement],
  );

  const isCurrentMonth = monthCursor.year === todayMonth.year && monthCursor.month === todayMonth.month;
  const week = daysAround(weekAnchor);

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
      {/* Custom category colours: one rule per category, generated from validated hex values. */}
      <style>{customColorCss(categories)}</style>
      <TopBar
        today={now.today}
        text={quickText}
        onText={setQuickText}
        onSubmit={openNew}
        onSettings={() => setSettingsOpen(true)}
        onSearch={() => setSearchOpen(true)}
      />
      <main className={display.hideDone ? "board hide-done" : "board"}>
        <TodayPane
          date={selected}
          isToday={selected === now.today}
          nowMinutes={now.minutes}
          items={visible}
          categories={categories}
          holiday={holidays.get(selected)}
          overdue={overdueTasks(visible, now.today)}
          undated={visible.filter((item) => item.when.kind === "none" && !item.done.includes("done"))}
          onToggle={toggleDone}
          onEdit={openEdit}
          today={now.today}
          onReschedule={(ids, target) => {
            remember(`${ids.length}개를 옮겼습니다`);
            setItems((current) => reschedule(current, ids, target, now.today, () => crypto.randomUUID()));
          }}
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
            holidays={holidays}
            onSelect={select}
            onEdit={openEdit}
            onPrev={() => setWeekAnchor(addDays(weekAnchor, -7))}
            onNext={() => setWeekAnchor(addDays(weekAnchor, 7))}
            onReset={weekAnchor === now.today ? undefined : () => setWeekAnchor(now.today)}
          />
          <MonthPane
            year={monthCursor.year}
            month={monthCursor.month}
            weekStart={display.weekStart}
            today={now.today}
            selected={selected}
            items={visible}
            categories={categories}
            holidays={holidays}
            cellCapacity={theme === "desk" ? 2 : 3}
            tabs={tabs}
            activeTab={activeTab}
            onTab={chooseTab}
            onAddTab={() => setEditing("new")}
            onEditTab={setEditing}
            onMoveTab={(id, index) => setTabs(moveTab(tabs, id, index))}
            allFilter={allFilter}
            onAllFilter={setAllFilter}
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
      >
        <AiSettings
          settings={llm}
          onChange={(next) => {
            setLlm(next);
            saveLlmSettings(next);
          }}
        />
        <DisplaySettings
          display={display}
          onChange={(next) => {
            setDisplay(next);
            saveDisplay(next);
          }}
        />
        <NotificationSettings
          settings={notifications}
          onChange={(next) => {
            setNotifications(next);
            saveNotificationSettings(next);
          }}
        />
        <StorageSettings dir={persisted.dir} errors={persisted.errors} onSwitch={persisted.switchFolder} />
        <HolidaySettings
          apiKey={holidayKey}
          status={special.status}
          onSave={(key) => {
            saveApiKey(key);
            setHolidayKey(loadApiKey());
          }}
        />
        <BackupSettings board={persisted.board} today={now.today} />
        <CategorySettings
          categories={categories}
          tabs={tabs}
          onAdd={() => {
            const id = crypto.randomUUID();

            setCategories(addCategory(categories, id));

            return id;
          }}
          onRename={(id, name) => setCategories(renameCategory(categories, id, name))}
          onRecolor={(id, slot) => setCategories(recolorCategory(categories, id, slot))}
          onCustomColor={(id, hex) => setCategories(setCustomColor(categories, id, hex))}
          onDelete={removeCategory}
        />
      </SettingsDialog>
      {editing !== undefined && (
        <TabEditor
          tab={editedTab}
          tabs={tabs}
          categories={categories}
          onSave={(name, categoryIds) => {
            if (editedTab === undefined) {
              const id = crypto.randomUUID();

              setTabs(addTab(tabs, id, name, categoryIds));
              setActiveTab(id);
            } else {
              setTabs(updateTab(tabs, editedTab.id, name, categoryIds));
            }

            setEditing(undefined);
          }}
          onDelete={() => {
            remember("탭을 삭제했습니다");
            setTabs(deleteTab(tabs, editing));
            chooseTab(ALL_TAB_ID);
            setEditing(undefined);
          }}
          onMove={(delta) => setTabs(moveTab(tabs, editing, tabs.findIndex((t) => t.id === editing) + delta))}
          onClose={() => setEditing(undefined)}
        />
      )}
      {undo !== undefined && (
        <div className="toast" role="status">
          <span>{undo.label}</span>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              const before = undo.board;

              persisted.update(() => before);
              setUndo(undefined);
            }}
          >
            되돌리기
          </button>
        </div>
      )}
      {searchOpen && (
        <SearchDialog
          items={items}
          categories={categories}
          today={now.today}
          onOpen={(item, date) => {
            setSearchOpen(false);
            openEdit(item, date);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {confirm !== undefined && (
        <ConfirmDialog
          drafts={confirm.drafts}
          editing={confirm.editing}
          occurrence={confirm.occurrence}
          extractions={confirm.editing ? undefined : ai.extractions}
          aiNote={confirm.editing ? undefined : ai.note}
          categories={categories}
          onConfirm={saveDrafts}
          onDelete={deleteItem}
          onCancel={() => {
            aiSession.current += 1;
            setConfirm(undefined);
          }}
        />
      )}
    </div>
  );
}
