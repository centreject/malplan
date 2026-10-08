import { CircleAlert, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { NEW_CATEGORY, cardErrors, repeatSeed, type Card, type CardErrors, type CardKind, type Draft, type RepeatFreq } from "../domain/card";
import type { IsoDate, Weekday } from "../domain/date";
import type { Category, ItemTime } from "../domain/item";
import type { SeriesScope } from "../domain/series";
import type { Slot } from "../parse/parseKorean";
import { SLOT_NAMES, WEEKDAY_NAMES, shortDate } from "./format";

type ConfirmDialogProps = {
  /** Cards to start from: parsed input (new) or one existing item (edit). */
  drafts: Draft[];
  /** Edit mode: shows 삭제 and the recurring-scope note. */
  editing: boolean;
  categories: Category[];
  /** The occurrence that was clicked; enables the 이 일정만 / 이후 전부 / 전체 choice for a series. */
  occurrence?: IsoDate | undefined;
  onConfirm: (drafts: Draft[], scope: SeriesScope) => void;
  onDelete: (id: string, scope: SeriesScope) => void;
  onCancel: () => void;
};

const KINDS: [CardKind, string][] = [["event", "일정"], ["task", "할 일"], ["undated", "날짜 없는 할 일"]];

const TIME_MODES: [ItemTime["kind"], string][] = [
  ["exact", "정확한 시각"], ["slot", "시간대"], ["undecided", "미정"], ["anytime", "아무때나"],
];

const FREQS: [RepeatFreq, string][] = [
  ["daily", "매일"], ["weekly", "매주"], ["biweekly", "격주"],
  ["monthlyDay", "매월 (N일)"], ["monthlyNth", "매월 (N번째·마지막 X요일)"], ["yearly", "매년"],
];

const NTHS: [number, string][] = [[1, "첫째"], [2, "둘째"], [3, "셋째"], [4, "넷째"], [-1, "마지막"]];

const SLOTS: Slot[] = ["morning", "lunch", "dinner", "night"];

const REMINDERS: [string, string][] = [["", "없음"], ["10", "10분 전"], ["30", "30분 전"], ["60", "1시간 전"], ["1440", "하루 전"]];

const WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

const SCOPES: [SeriesScope, string][] = [["this", "이 일정만"], ["future", "이후 전부"], ["all", "전체"]];

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

const MONTHS = DAYS.slice(0, 12);

/** The confirm screen (= edit screen): one card per parsed part, saved only on 확인. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { drafts: initial, editing, categories, occurrence, onConfirm, onDelete, onCancel } = props;
  const dialog = useRef<HTMLDialogElement>(null);
  const [drafts, setDrafts] = useState(initial);
  const [scope, setScope] = useState<SeriesScope>(occurrence === undefined ? "all" : "this");

  useEffect(() => {
    if (dialog.current?.open === false) {
      dialog.current.showModal();
    }
  }, []);

  const errors = drafts.map((draft) => cardErrors(draft.card));

  const update = (id: string, card: Card) => {
    setDrafts((current) => current.map((draft) => (draft.id === id ? { id, card } : draft)));
  };

  const exclude = (id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (errors.some((e) => Object.keys(e).length > 0)) {
      event.currentTarget.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();

      return;
    }

    onConfirm(drafts, scope);
  };

  const recurring = editing && drafts[0]?.card.repeat === true;

  return (
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby="confirm-title"
      // Escape: cancel fires synchronously; close stays as the fallback when the browser skips cancel.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClose={onCancel}
    >
      <form className="confirm-form" onSubmit={submit} noValidate>
        <header className="settings-head">
          <h2 id="confirm-title">{editing ? "항목 수정" : drafts.length > 1 ? `새 항목 ${drafts.length}개 확인` : "새 항목 확인"}</h2>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="닫기 (취소)">
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="confirm-body">
          {recurring && occurrence === undefined && <p className="confirm-note">반복 일정 전체에 적용됩니다.</p>}
          {recurring && occurrence !== undefined && (
            <fieldset className="scope-choice">
              <legend>반복 일정 중 어디에 적용할까요?</legend>
              {SCOPES.map(([value, label]) => (
                <label key={value}>
                  <input type="radio" name="scope" checked={scope === value} onChange={() => setScope(value)} />
                  {value === "this" ? `${label} (${shortDate(occurrence)})` : label}
                </label>
              ))}
            </fieldset>
          )}
          {drafts.length === 0 && <p className="empty">모든 항목을 제외했습니다. 취소를 누르세요.</p>}
          {drafts.map((draft, index) => (
            <CardEditor
              key={draft.id}
              card={draft.card}
              errors={errors[index] ?? {}}
              categories={categories}
              heading={drafts.length > 1 ? `${index + 1} / ${drafts.length}` : undefined}
              onChange={(card) => update(draft.id, card)}
              onExclude={drafts.length > 1 ? () => exclude(draft.id) : undefined}
            />
          ))}
        </div>

        <footer className="confirm-foot">
          {editing && (
            <button type="button" className="confirm-button confirm-delete" onClick={() => onDelete(drafts[0]?.id ?? "", scope)}>
              <Trash2 size={16} strokeWidth={2} />
              삭제
            </button>
          )}
          <button type="button" className="confirm-button" onClick={onCancel}>
            취소
          </button>
          <button type="submit" className="confirm-button is-primary" disabled={drafts.length === 0}>
            확인
          </button>
        </footer>
      </form>
    </dialog>
  );
}

type CardEditorProps = {
  card: Card;
  errors: CardErrors;
  categories: Category[];
  heading: string | undefined;
  onChange: (card: Card) => void;
  onExclude: (() => void) | undefined;
};

function CardEditor({ card, errors, categories, heading, onChange, onExclude }: CardEditorProps) {
  const base = useId();
  const id = (field: string) => `${base}-${field}`;
  const set = (patch: Partial<Card>) => onChange({ ...card, ...patch });

  /** Props tying a control to its inline error. */
  const invalid = (field: keyof CardErrors) => ({
    "aria-invalid": errors[field] !== undefined,
    "aria-describedby": errors[field] === undefined ? undefined : id(`${field}-error`),
  });

  const error = (field: keyof CardErrors) => <FieldError id={id(`${field}-error`)} message={errors[field]} />;
  const dated = card.kind !== "undated";

  return (
    <section className="confirm-card" aria-label={heading === undefined ? card.title : `항목 ${heading}`}>
      {heading !== undefined && (
        <header className="confirm-card-head">
          <span className="num">{heading}</span>
          {onExclude !== undefined && (
            <button type="button" className="text-button" onClick={onExclude}>
              <X size={14} strokeWidth={2} aria-hidden="true" /> 이 항목 제외
            </button>
          )}
        </header>
      )}

      <Field label="제목" htmlFor={id("title")}>
        <input
          id={id("title")}
          className="cf-input"
          value={card.title}
          onChange={(event) => set({ title: event.target.value })}
          autoComplete="off"
          {...invalid("title")}
        />
        {error("title")}
      </Field>

      <Field label="종류" groupId={id("kind")}>
        <Segmented name={id("kind-radio")} labelledBy={id("kind")} value={card.kind} options={KINDS} onChange={(kind) => set({ kind })} />
      </Field>

      {dated && (
        <>
          <Field
            label={card.repeat ? "시작일" : "날짜"}
            htmlFor={id("date")}
            badge={card.flags.includes("rolledToNextYear") ? <Guess text="내년으로 해석함" /> : undefined}
          >
            <span className="cf-row">
              <input
                id={id("date")}
                type="date"
                className="cf-input cf-date num"
                value={card.date}
                onChange={(event) => set({ date: event.target.value })}
                {...invalid("date")}
              />
              <label className="cf-check">
                <input
                  type="checkbox"
                  checked={card.repeat}
                  onChange={(event) => set(event.target.checked ? { repeat: true, ...repeatSeed(card.date) } : { repeat: false })}
                />
                반복
              </label>
            </span>
            {error("date")}
          </Field>

          {card.repeat ? (
            <RepeatFields card={card} set={set} id={id} invalid={invalid} error={error} />
          ) : (
            <Field label="기간" htmlFor={id("end-date")}>
              <span className="cf-row">
                <span className="cf-hint">~</span>
                <input
                  id={id("end-date")}
                  type="date"
                  className="cf-input cf-date num"
                  value={card.endDate}
                  min={card.date}
                  onChange={(event) => set({ endDate: event.target.value })}
                  {...invalid("endDate")}
                />
                {card.endDate === "" && <span className="cf-hint">하루 일정이면 비워 두세요</span>}
              </span>
              {error("endDate")}
            </Field>
          )}

          <Field
            label="시간"
            groupId={id("time")}
            badge={card.flags.includes("assumedPm") ? <Guess text="오후로 해석함" /> : undefined}
          >
            <Segmented name={id("time-radio")} labelledBy={id("time")} value={card.timeMode} options={TIME_MODES} onChange={(timeMode) => set({ timeMode })} />
            {card.timeMode === "exact" && (
              <span className="cf-row">
                <input
                  type="time"
                  className="cf-input cf-time num"
                  value={card.start}
                  onChange={(event) => set({ start: event.target.value })}
                  aria-label="시작 시각"
                  {...invalid("start")}
                />
                <span className="cf-hint">~</span>
                <input
                  type="time"
                  className="cf-input cf-time num"
                  value={card.end}
                  onChange={(event) => set({ end: event.target.value })}
                  aria-label="끝 시각 (선택)"
                  {...invalid("end")}
                />
              </span>
            )}
            {card.timeMode === "slot" && (
              <select
                className="cf-input cf-select"
                value={card.slot}
                onChange={(event) => set({ slot: SLOTS.find((slot) => slot === event.target.value) ?? "morning" })}
                aria-label="시간대"
              >
                {SLOTS.map((slot) => (
                  <option key={slot} value={slot}>{SLOT_NAMES[slot]}</option>
                ))}
              </select>
            )}
            {error("start")}
            {error("end")}
          </Field>
        </>
      )}

      <Field label="분류" htmlFor={id("category")}>
        <select
          id={id("category")}
          className="cf-input cf-select"
          value={card.categoryId}
          onChange={(event) => set({ categoryId: event.target.value })}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
          <option value={NEW_CATEGORY}>+ 분류 추가</option>
        </select>
        {card.categoryId === NEW_CATEGORY && (
          <input
            className="cf-input"
            value={card.newCategory}
            onChange={(event) => set({ newCategory: event.target.value })}
            placeholder="새 분류 이름 (확인을 누르면 만들어집니다)"
            aria-label="새 분류 이름"
            autoComplete="off"
            autoFocus
            {...invalid("newCategory")}
          />
        )}
        {error("newCategory")}
      </Field>

      <Field label="장소" htmlFor={id("place")}>
        <input id={id("place")} className="cf-input" value={card.place} onChange={(event) => set({ place: event.target.value })} autoComplete="off" />
      </Field>

      <Field label="비고" htmlFor={id("note")}>
        <textarea id={id("note")} className="cf-input cf-note" rows={2} value={card.note} onChange={(event) => set({ note: event.target.value })} />
      </Field>

      {dated && (
        <Field label="알림" htmlFor={id("remind")}>
          <select
            id={id("remind")}
            className="cf-input cf-select"
            value={card.remindMinutes === undefined ? "" : String(card.remindMinutes)}
            onChange={(event) => set({ remindMinutes: event.target.value === "" ? undefined : Number(event.target.value) })}
          >
            {REMINDERS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </Field>
      )}
    </section>
  );
}

type RepeatFieldsProps = {
  card: Card;
  set: (patch: Partial<Card>) => void;
  id: (field: string) => string;
  invalid: (field: keyof CardErrors) => { "aria-invalid": boolean; "aria-describedby": string | undefined };
  error: (field: keyof CardErrors) => ReactNode;
};

function RepeatFields({ card, set, id, invalid, error }: RepeatFieldsProps) {
  const weekly = card.freq === "weekly" || card.freq === "biweekly";

  const toggleWeekday = (weekday: Weekday, on: boolean) => {
    set({ weekdays: on ? [...card.weekdays, weekday] : card.weekdays.filter((d) => d !== weekday) });
  };

  return (
    <>
      <Field label="반복" htmlFor={id("freq")}>
        <span className="cf-row">
          <select
            id={id("freq")}
            className="cf-input cf-select"
            value={card.freq}
            onChange={(event) => set({ freq: FREQS.find(([freq]) => freq === event.target.value)?.[0] ?? "weekly" })}
          >
            {FREQS.map(([freq, label]) => (
              <option key={freq} value={freq}>{label}</option>
            ))}
          </select>

          {card.freq === "monthlyDay" && (
            <NumberSelect label="매월 며칠" values={DAYS} suffix="일" value={card.monthDay} onChange={(monthDay) => set({ monthDay })} />
          )}

          {card.freq === "monthlyNth" && (
            <>
              <select
                className="cf-input cf-select"
                value={card.nth}
                onChange={(event) => set({ nth: Number(event.target.value) })}
                aria-label="몇째 주"
              >
                {NTHS.map(([nth, label]) => (
                  <option key={nth} value={nth}>{label}</option>
                ))}
              </select>
              <select
                className="cf-input cf-select"
                value={card.nthWeekday}
                onChange={(event) => set({ nthWeekday: WEEKDAYS.find((d) => d === Number(event.target.value)) ?? 0 })}
                aria-label="요일"
              >
                {WEEKDAYS.map((weekday) => (
                  <option key={weekday} value={weekday}>{WEEKDAY_NAMES[weekday]}요일</option>
                ))}
              </select>
            </>
          )}

          {card.freq === "yearly" && (
            <>
              <NumberSelect label="매년 몇 월" values={MONTHS} suffix="월" value={card.yearMonth} onChange={(yearMonth) => set({ yearMonth })} />
              <NumberSelect label="매년 며칠" values={DAYS} suffix="일" value={card.monthDay} onChange={(monthDay) => set({ monthDay })} />
            </>
          )}
        </span>
      </Field>

      {weekly && (
        <Field label="요일" groupId={id("weekdays")}>
          <span className="cf-chips" role="group" aria-labelledby={id("weekdays")} {...invalid("weekdays")}>
            {WEEKDAYS.map((weekday) => (
              <label key={weekday} className="cf-chip">
                <input
                  type="checkbox"
                  checked={card.weekdays.includes(weekday)}
                  onChange={(event) => toggleWeekday(weekday, event.target.checked)}
                />
                {WEEKDAY_NAMES[weekday]}
              </label>
            ))}
          </span>
          {error("weekdays")}
        </Field>
      )}

      <Field label="종료일" htmlFor={id("until")}>
        <span className="cf-row">
          <input
            id={id("until")}
            type="date"
            className="cf-input cf-date num"
            value={card.until}
            min={card.date}
            disabled={card.until === ""}
            onChange={(event) => set({ until: event.target.value })}
            {...invalid("until")}
          />
          <label className="cf-check">
            <input
              type="checkbox"
              checked={card.until === ""}
              onChange={(event) => set({ until: event.target.checked ? "" : card.date })}
            />
            무기한
          </label>
        </span>
        {error("until")}
      </Field>
    </>
  );
}

type FieldProps = {
  label: string;
  /** Id of the single control the label names. */
  htmlFor?: string;
  /** Id given to the label text when the field is a group (radios, chips). */
  groupId?: string;
  badge?: ReactNode;
  children: ReactNode;
};

function Field({ label, htmlFor, groupId, badge, children }: FieldProps) {
  return (
    <div className="cf-field">
      <span className="cf-label">
        {htmlFor === undefined ? <span id={groupId}>{label}</span> : <label htmlFor={htmlFor}>{label}</label>}
        {badge}
      </span>
      <div className="cf-control">{children}</div>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string | undefined }) {
  if (message === undefined) {
    return null;
  }

  return (
    <p id={id} className="cf-error">
      <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
      {message}
    </p>
  );
}

/** "추정" badge for parser guesses, with what was guessed. */
function Guess({ text }: { text: string }) {
  return (
    <span className="cf-guess">
      <span className="cf-guess-badge">추정</span>
      <span className="cf-guess-text">{text}</span>
    </span>
  );
}

type SegmentedProps<T extends string> = {
  name: string;
  labelledBy: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
};

function Segmented<T extends string>({ name, labelledBy, value, options, onChange }: SegmentedProps<T>) {
  return (
    <span className="cf-chips" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(([option, label]) => (
        <label key={option} className="cf-chip">
          <input type="radio" name={name} value={option} checked={option === value} onChange={() => onChange(option)} />
          {label}
        </label>
      ))}
    </span>
  );
}

type NumberSelectProps = {
  label: string;
  values: number[];
  suffix: string;
  value: number;
  onChange: (value: number) => void;
};

function NumberSelect({ label, values, suffix, value, onChange }: NumberSelectProps) {
  return (
    <select className="cf-input cf-select num" value={value} onChange={(event) => onChange(Number(event.target.value))} aria-label={label}>
      {values.map((n) => (
        <option key={n} value={n}>{n}{suffix}</option>
      ))}
    </select>
  );
}
