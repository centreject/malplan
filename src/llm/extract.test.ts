import { describe, expect, test } from "vitest";
import { cardFromParse, NEW_CATEGORY, type Card } from "../domain/card";
import type { Category } from "../domain/item";
import { parseKorean } from "../parse/parseKorean";
import { applyExtraction, buildPrompt, parseExtraction, type Extraction } from "./extract";

const today = "2026-10-11";

const categories: Category[] = [
  { id: "work", name: "회사", colorSlot: 1 },
  { id: "meet", name: "약속", colorSlot: 3 },
];

const text = "10월 31일에 김철수와 저녁약속 있음. 서울 어딘가에서 볼 듯? 메뉴는 안 정함";

const card: Card = cardFromParse(parseKorean(text, today), today, categories);

describe("buildPrompt", () => {
  test("names the categories, today, and asks for JSON only; dates stay with code", () => {
    const { system, user } = buildPrompt(text, categories, [], today);

    expect(system).toContain("회사");
    expect(system).toContain("약속");
    expect(system).toContain("JSON");
    expect(system).toContain("날짜");
    expect(user).toContain(text);
  });

  test("recent user corrections become examples", () => {
    const { system } = buildPrompt(text, categories, [{ input: "김철수 저녁", category: "약속" }], today);

    expect(system).toContain("김철수 저녁");
  });
});

describe("parseExtraction", () => {
  test("plain JSON", () => {
    const out = parseExtraction('{"title":"김철수와 저녁 약속","kind":"event","category":"약속","place":"서울 (미정)","placeGuessed":false,"note":"메뉴 미정"}');

    expect(out).toEqual({
      title: "김철수와 저녁 약속",
      kind: "event",
      category: "약속",
      place: "서울 (미정)",
      placeGuessed: false,
      note: "메뉴 미정",
    });
  });

  test("tolerates a markdown fence and surrounding text", () => {
    const out = parseExtraction('네, 결과입니다:\n```json\n{"title":"우편물 발송","kind":"task","category":"회사"}\n```');

    expect(out?.title).toBe("우편물 발송");
    expect(out?.place).toBeUndefined();
  });

  test("garbage or wrong shapes give undefined, never throw", () => {
    expect(parseExtraction("모르겠습니다")).toBeUndefined();
    expect(parseExtraction('{"title": 3}')).toBeUndefined();
  });
});

describe("applyExtraction", () => {
  const extraction: Extraction = {
    title: "김철수와 저녁 약속",
    kind: "event",
    category: "약속",
    place: "서울 (미정)",
    placeGuessed: true,
    note: "메뉴 미정",
  };

  test("fills title, kind, category, place and note; dates and times untouched", () => {
    const next = applyExtraction(card, extraction, categories, []);

    expect(next.title).toBe("김철수와 저녁 약속");
    expect(next.categoryId).toBe("meet");
    expect(next.place).toBe("서울 (미정)");
    expect(next.note).toBe("메뉴 미정");
    expect(next.flags).toContain("placeGuessed");
    expect(next.date).toBe(card.date);
    expect(next.timeMode).toBe(card.timeMode);
  });

  test("an unknown category becomes a proposed new one", () => {
    const next = applyExtraction(card, { ...extraction, category: "친구" }, categories, []);

    expect(next.categoryId).toBe(NEW_CATEGORY);
    expect(next.newCategory).toBe("친구");
  });

  test("fields the user already edited are left alone", () => {
    const next = applyExtraction({ ...card, title: "내가 고친 제목" }, extraction, categories, ["title"]);

    expect(next.title).toBe("내가 고친 제목");
    expect(next.place).toBe("서울 (미정)");
  });

  test("applying twice is harmless (no duplicate flags)", () => {
    const once = applyExtraction(card, extraction, categories, []);

    expect(applyExtraction(once, extraction, categories, [])).toEqual(once);
  });

  test("an undated card stays undated even if the model says task", () => {
    const next = applyExtraction({ ...card, kind: "undated" }, { ...extraction, kind: "task" }, categories, []);

    expect(next.kind).toBe("undated");
  });
});
