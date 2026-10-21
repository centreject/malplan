import { describe, expect, test } from "vitest";
import { cardFromItem, itemFromCard } from "./card";
import type { Category, Item } from "./item";
import { REPEAT_DATE_REFUSAL, applyEditCommand, editResult } from "./editCommand";
import { editOccurrence } from "./series";

const today = "2026-10-05";

const categories: Category[] = [
  { id: "work", name: "회사", colorSlot: 1 },
  { id: "meet", name: "약속", colorSlot: 3 },
];

const item: Item = {
  id: "a",
  title: "팀 회의",
  kind: "event",
  categoryId: "work",
  when: { kind: "single", date: "2026-10-07" },
  time: { kind: "exact", start: { hour: 16, minute: 0 } },
  done: [],
  place: "3층 회의실",
};

const card = cardFromItem(item, today);

function edit(text: string) {
  const result = applyEditCommand(card, text, today, categories);

  return result === REPEAT_DATE_REFUSAL ? undefined : result;
}

// Weekly on Wednesday from 9/30; the 10/14 occurrence is the one clicked.
const weekly: Item = { ...item, id: "w", when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-09-30" } } };

const weeklyCard = cardFromItem(weekly, today);

describe("applyEditCommand on a repeating item", () => {
  test("a shift moves only the clicked occurrence, saved as 이 일정만", () => {
    const result = applyEditCommand(weeklyCard, "하루 미뤄", today, categories, "2026-10-14");

    if (result === undefined || result === REPEAT_DATE_REFUSAL) {
      throw new Error("expected an edit");
    }

    expect([result.card.date, result.card.repeat]).toEqual(["2026-10-15", false]);
    expect(result.changes).toEqual(["날짜: 10/14 → 10/15", "반복: 이 일정만 옮김"]);

    const saved = editOccurrence([weekly], weekly, itemFromCard(result.card, "w"), "2026-10-14", "this", () => "moved");

    expect(saved.map((i) => i.when)).toEqual([
      { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-09-30", except: ["2026-10-14"] } },
      { kind: "single", date: "2026-10-15" },
    ]);
  });

  test("a named day is read from today and moves the occurrence too", () => {
    const result = applyEditCommand(weeklyCard, "금요일로 옮겨", today, categories, "2026-10-14");

    expect(result !== REPEAT_DATE_REFUSAL && [result?.card.date, result?.card.repeat]).toEqual(["2026-10-09", false]);
  });

  test("a non-date change keeps the series start", () => {
    const result = applyEditCommand(weeklyCard, "3시로 바꿔", today, categories, "2026-10-14");

    expect(result !== REPEAT_DATE_REFUSAL && [result?.card.date, result?.card.repeat]).toEqual(["2026-09-30", true]);
  });

  test("a date change with no clicked occurrence is refused", () => {
    expect(applyEditCommand(weeklyCard, "하루 미뤄", today, categories)).toBe(REPEAT_DATE_REFUSAL);
  });
});

describe("editResult", () => {
  test("a kind-only change is described", () => {
    expect(editResult(card, { ...card, kind: "task" }, categories)?.changes).toEqual(["종류: 일정 → 할 일"]);
  });
});

describe("applyEditCommand", () => {
  test("a new time", () => {
    const result = edit("3시로 바꿔");

    expect([result?.card.timeMode, result?.card.start]).toEqual(["exact", "15:00"]);
    expect(result?.changes).toEqual(["시간: 16:00 → 15:00"]);
  });

  test("a new start keeps the length of a timed range", () => {
    const meeting = cardFromItem({ ...item, time: { kind: "exact", start: { hour: 14, minute: 0 }, end: { hour: 15, minute: 30 } } }, today);

    const end = (text: string) => {
      const result = applyEditCommand(meeting, text, today, categories);

      return result === undefined || result === REPEAT_DATE_REFUSAL ? result : result.card.end;
    };

    expect(end("3시로 바꿔")).toBe("16:30");
    expect(end("11시로 바꿔")).toBe("12:30");
    expect(end("3시부터 5시로")).toBe("17:00");
    // Past midnight the range would wrap; the end is left for the user.
    expect(end("밤 11시로 바꿔")).toBe("");
  });

  test("a new date, as the parser reads it", () => {
    expect(edit("금요일로 옮겨")?.card.date).toBe("2026-10-09");
  });

  test("shifting from the item's own date", () => {
    expect(edit("하루 미뤄")?.card.date).toBe("2026-10-08");
    expect(edit("다음 주로 미뤄")?.card.date).toBe("2026-10-14");
    expect(edit("이틀 당겨")?.card.date).toBe("2026-10-05");
  });

  test("place, title, category and note by name", () => {
    expect(edit("장소는 강남역으로 바꿔")?.card.place).toBe("강남역");
    expect(edit("제목을 주간 회의로 변경")?.card.title).toBe("주간 회의");
    expect(edit("약속으로 분류 바꿔")?.card.categoryId).toBe("meet");
    expect(edit("메모에 노트북 챙기기 추가")?.card.note).toBe("노트북 챙기기");
  });

  test("a kind by name, alone or with other fields", () => {
    expect(edit("할 일로 바꿔")?.card.kind).toBe("task");
    expect(edit("할 일로 바꿔")?.changes).toEqual(["종류: 일정 → 할 일"]);

    const both = edit("약속으로 분류, 할 일로 바꿔줘");

    expect([both?.card.kind, both?.card.categoryId]).toEqual(["task", "meet"]);
  });

  test("date and time together", () => {
    const result = edit("내일 오전 10시로");

    expect([result?.card.date, result?.card.start]).toEqual(["2026-10-06", "10:00"]);
    expect(result?.changes).toHaveLength(2);
  });

  test("nothing understood gives undefined", () => {
    expect(edit("음 잘 모르겠네")).toBeUndefined();
  });
});
