import { describe, expect, test } from "vitest";
import { cardFromItem } from "./card";
import type { Category, Item } from "./item";
import { applyEditCommand } from "./editCommand";

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
  return applyEditCommand(card, text, today, categories);
}

describe("applyEditCommand", () => {
  test("a new time", () => {
    const result = edit("3시로 바꿔");

    expect([result?.card.timeMode, result?.card.start]).toEqual(["exact", "15:00"]);
    expect(result?.changes).toEqual(["시간: 16:00 → 15:00"]);
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

  test("date and time together", () => {
    const result = edit("내일 오전 10시로");

    expect([result?.card.date, result?.card.start]).toEqual(["2026-10-06", "10:00"]);
    expect(result?.changes).toHaveLength(2);
  });

  test("nothing understood gives undefined", () => {
    expect(edit("음 잘 모르겠네")).toBeUndefined();
  });
});
