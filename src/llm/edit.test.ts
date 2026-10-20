import { describe, expect, test } from "vitest";
import { cardFromItem } from "../domain/card";
import type { Category, Item } from "../domain/item";
import { applyEditReply, buildEditPrompt } from "./edit";

const categories: Category[] = [
  { id: "work", name: "회사", colorSlot: 1 },
  { id: "meet", name: "약속", colorSlot: 3 },
];

const item: Item = {
  id: "a",
  title: "저녁 약속",
  kind: "event",
  categoryId: "meet",
  when: { kind: "single", date: "2026-10-07" },
  time: { kind: "slot", slot: "dinner" },
  done: [],
};

const card = cardFromItem(item, "2026-10-05");

describe("edit by AI", () => {
  test("the prompt carries the current item and asks only for changed fields", () => {
    const prompt = buildEditPrompt(card, "민수도 같이 가는 걸로", categories);

    expect(prompt.system).toContain("저녁 약속");
    expect(prompt.system).toContain("바뀌는 필드만");
    expect(prompt.schema.required).toEqual([]);
  });

  test("changed fields apply; unknown categories and empty replies do not", () => {
    expect(applyEditReply(card, '{"title":"민수와 저녁 약속"}', categories)?.changes).toEqual(["제목: 저녁 약속 → 민수와 저녁 약속"]);
    expect(applyEditReply(card, '{"category":"동아리"}', categories)).toBeUndefined();
    expect(applyEditReply(card, "{}", categories)).toBeUndefined();
    expect(applyEditReply(card, "모르겠습니다", categories)).toBeUndefined();
  });
});
