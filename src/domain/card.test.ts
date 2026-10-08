import { describe, expect, test } from "vitest";
import { parseKorean } from "../parse/parseKorean";
import {
  NEW_CATEGORY,
  cardFromItem,
  cardFromParse,
  cardErrors,
  commitCards,
  guessCategory,
  guessKind,
  itemFromCard,
  splitInput,
  type Card,
} from "./card";
import type { Category, Item } from "./item";

// 2026-10-05 is a Monday.
const today = "2026-10-05";

const categories: Category[] = [
  { id: "work", name: "회사", colorSlot: 1 },
  { id: "school", name: "학교", colorSlot: 2 },
];

function item(fields: Partial<Item>): Item {
  return {
    id: "a",
    title: "회의",
    kind: "event",
    categoryId: "work",
    when: { kind: "single", date: today },
    time: { kind: "anytime" },
    done: [],
    ...fields,
  };
}

function ids(): () => string {
  let n = 0;

  return () => `id${++n}`;
}

function roundTrip(original: Item): Item {
  return itemFromCard(cardFromItem(original, today), original.id);
}

describe("guessKind", () => {
  test("action endings are tasks", () => {
    expect(guessKind("주간 보고서 제출")).toBe("task");
    expect(guessKind("택배 반품 보내기")).toBe("task");
    expect(guessKind("운동화 사기")).toBe("task");
    expect(guessKind("공모전 서류 마감 ")).toBe("task");
  });

  test("everything else is an event", () => {
    expect(guessKind("김철수와 저녁")).toBe("event");
    expect(guessKind("")).toBe("event");
  });
});

describe("guessCategory", () => {
  test("category name inside the title wins", () => {
    expect(guessCategory("학교 과제 제출", categories)).toBe("school");
  });

  test("falls back to the first category", () => {
    expect(guessCategory("치과", categories)).toBe("work");
    expect(guessCategory("치과", [])).toBe("");
  });
});

describe("splitInput", () => {
  test("splits on newlines and semicolons, dropping blanks", () => {
    expect(splitInput("내일 치과; 모레 회의\n 글피 장보기 ;")).toEqual(["내일 치과", "모레 회의", "글피 장보기"]);
  });
});

describe("cardFromParse", () => {
  test("weekly spec example", () => {
    const card = cardFromParse(parseKorean("12월 28일까지 매주 수요일 오후 4시 회사 우편물 발송", today), today, categories);

    expect(card).toMatchObject({
      title: "회사 우편물 발송",
      kind: "task",
      repeat: true,
      freq: "weekly",
      weekdays: [3],
      date: today,
      until: "2026-12-28",
      timeMode: "exact",
      start: "16:00",
      end: "",
      categoryId: "work",
    });
  });

  test("flags carry over for the 추정 badges", () => {
    const card = cardFromParse(parseKorean("3시 회의", today), today, categories);

    expect(card.flags).toEqual(["assumedPm"]);
    expect(card.start).toBe("15:00");
  });

  test("a task with no date becomes an undated task", () => {
    const card = cardFromParse(parseKorean("운동화 사기", today), today, categories);

    expect(card.kind).toBe("undated");
    expect(card.timeMode).toBe("anytime");
  });

  test("an event with no date or time lands today with time undecided", () => {
    const card = cardFromParse(parseKorean("동아리 모임", today), today, categories);

    expect(card).toMatchObject({ kind: "event", date: today, repeat: false, timeMode: "undecided" });
  });

  test("range and slot", () => {
    const card = cardFromParse(parseKorean("10월 20일부터 22일까지 저녁 제주 여행", today), today, categories);

    expect(card).toMatchObject({ date: "2026-10-20", endDate: "2026-10-22", timeMode: "slot", slot: "dinner" });
  });
});

describe("cardFromItem / itemFromCard round-trips", () => {
  test.each<[string, Item["when"]]>([
    ["single", { kind: "single", date: "2026-10-07" }],
    ["range", { kind: "range", start: "2026-10-14", end: "2026-10-16" }],
    ["daily", { kind: "recurring", rule: { freq: "daily", start: "2026-10-01" } }],
    ["weekly", { kind: "recurring", rule: { freq: "weekly", weekdays: [1, 3, 5], start: "2026-09-01", until: "2026-12-28" } }],
    ["biweekly", { kind: "recurring", rule: { freq: "weekly", weekdays: [2], start: "2026-09-01", interval: 2 } }],
    ["monthly day", { kind: "recurring", rule: { freq: "monthly", day: 25, start: "2026-07-07" } }],
    ["monthly nth", { kind: "recurring", rule: { freq: "monthly", nth: 2, weekday: 4, start: "2026-07-07" } }],
    ["monthly last", { kind: "recurring", rule: { freq: "monthly", nth: -1, weekday: 5, start: "2026-07-07" } }],
    ["yearly", { kind: "recurring", rule: { freq: "yearly", month: 3, day: 1, start: "2026-01-01", except: ["2027-03-01"] } }],
  ])("%s", (_, when) => {
    const original = item({ when });

    expect(roundTrip(original)).toEqual(original);
  });

  test("undated task, times, optional fields and done survive", () => {
    const undated = item({ kind: "task", when: { kind: "none" }, done: ["done"] });

    const exact = item({
      time: { kind: "exact", start: { hour: 9, minute: 30 }, end: { hour: 10, minute: 0 } },
      place: "3층",
      note: "자료",
      remindMinutes: 10,
    });

    const slot = item({ time: { kind: "slot", slot: "night" } });
    const undecided = item({ kind: "task", time: { kind: "undecided" }, done: ["2026-10-05"] });

    for (const original of [undated, exact, slot, undecided]) {
      expect(roundTrip(original)).toEqual(original);
    }
  });

  test("editing an undated item seeds the date fields from today", () => {
    const card = cardFromItem(item({ kind: "task", when: { kind: "none" } }), today);

    expect(card).toMatchObject({ kind: "undated", date: today, weekdays: [1] });
  });

  test("blank place and note are dropped, text is trimmed", () => {
    const card: Card = { ...cardFromItem(item({}), today), title: "  회의 ", place: " ", note: "" };

    expect(itemFromCard(card, "a")).toEqual(item({}));
  });
});

describe("cardErrors", () => {
  const base = cardFromItem(item({}), today);

  test("a valid card has no errors", () => {
    expect(cardErrors(base)).toEqual({});
  });

  test("empty title, end before start, missing weekday, new category without a name", () => {
    expect(cardErrors({ ...base, title: " " }).title).toBeDefined();
    expect(cardErrors({ ...base, endDate: "2026-10-04" }).endDate).toBeDefined();
    expect(cardErrors({ ...base, repeat: true, until: "2026-10-01" }).until).toBeDefined();
    expect(cardErrors({ ...base, repeat: true, freq: "weekly", weekdays: [] }).weekdays).toBeDefined();
    expect(cardErrors({ ...base, timeMode: "exact", start: "" }).start).toBeDefined();
    expect(cardErrors({ ...base, timeMode: "exact", start: "10:00", end: "09:00" }).end).toBeDefined();
    expect(cardErrors({ ...base, categoryId: NEW_CATEGORY, newCategory: "" }).newCategory).toBeDefined();
  });

  test("hidden fields do not block", () => {
    expect(cardErrors({ ...base, kind: "undated", endDate: "2026-10-01", timeMode: "exact", start: "" })).toEqual({});
    expect(cardErrors({ ...base, repeat: true, endDate: "2026-10-01" })).toEqual({});
  });
});

describe("commitCards", () => {
  test("creates a new category once, only for the cards that asked for it", () => {
    const card = cardFromItem(item({}), today);
    const fresh: Card = { ...card, categoryId: NEW_CATEGORY, newCategory: " 운동 " };

    const result = commitCards(
      [{ id: "x", card: fresh }, { id: "y", card: fresh }, { id: "z", card }],
      [],
      categories,
      ids(),
    );

    expect(result.categories).toEqual([...categories, { id: "id1", name: "운동", colorSlot: 3 }]);
    expect(result.items.map((i) => i.categoryId)).toEqual(["id1", "id1", "work"]);
    expect(result.items.map((i) => i.id)).toEqual(["x", "y", "z"]);
  });

  test("a new name matching an existing category reuses it", () => {
    const fresh: Card = { ...cardFromItem(item({}), today), categoryId: NEW_CATEGORY, newCategory: "학교" };

    const result = commitCards([{ id: "x", card: fresh }], [], categories, ids());

    expect(result.categories).toBe(categories);
    expect(result.items[0]?.categoryId).toBe("school");
  });

  test("a saved id replaces the stored item in place; new ids append", () => {
    const stored = [item({ id: "a" }), item({ id: "b", title: "b" })];
    const edited: Card = { ...cardFromItem(item({ id: "a" }), today), title: "바뀐 회의" };
    const added = cardFromItem(item({ title: "새 일정" }), today);

    const result = commitCards([{ id: "a", card: edited }, { id: "c", card: added }], stored, categories, ids());

    expect(result.items.map((i) => [i.id, i.title])).toEqual([["a", "바뀐 회의"], ["b", "b"], ["c", "새 일정"]]);
  });
});
