import { describe, expect, test } from "vitest";
import { cardFromParse, NEW_CATEGORY, type Card } from "../domain/card";
import type { Category } from "../domain/item";
import { parseKorean } from "../parse/parseKorean";
import {
  applyExtraction,
  buildPrompt,
  guardExtraction,
  NEW_CATEGORY_CHOICE,
  parseExtraction,
  pickCorrections,
  type Extraction,
} from "./extract";

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

  test("kind corrections show up in the example", () => {
    const { system } = buildPrompt(text, categories, [{ input: "김철수 저녁", category: "약속", kind: "task" }], today);

    expect(system).toContain('"김철수 저녁" → 분류 "약속", kind "task"');
  });

  test("the schema limits category to the user's names plus the new-category choice", () => {
    const { schema } = buildPrompt(text, categories, [], today);

    expect(schema.properties.category).toEqual({ enum: ["회사", "약속", NEW_CATEGORY_CHOICE] });
    expect(schema.required).toEqual(["title", "kind", "category"]);
  });
});

describe("pickCorrections", () => {
  const unrelated = Array.from({ length: 30 }, (_, index) => ({ input: `택배 ${index}번 보내기`, category: "회사" }));
  const wedding = { input: "토요일 사촌 결혼식", category: "약속" };

  test("old corrections sharing a word come first, then a few recent ones", () => {
    const picked = pickCorrections([wedding, ...unrelated], "다음 주 일요일 친구 결혼식", today);

    expect(picked[0]).toEqual(wedding);
    expect(picked.slice(1)).toEqual(unrelated.slice(-3));
  });

  test("date words alone do not make corrections similar", () => {
    expect(pickCorrections([wedding, ...unrelated], "토요일 장보기", today)).not.toContainEqual(wedding);
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

  test("the new-category choice becomes the proposed name", () => {
    expect(parseExtraction(`{"title":"동창회","kind":"event","category":"${NEW_CATEGORY_CHOICE}","newCategory":"친구"}`)?.category).toBe("친구");
    expect(parseExtraction(`{"title":"동창회","kind":"event","category":"${NEW_CATEGORY_CHOICE}"}`)).toBeUndefined();
    expect(parseExtraction('{"title":"동창회","kind":"event","category":"약속","newCategory":"친구"}')).toEqual({ title: "동창회", kind: "event", category: "약속" });
  });
});

function guard(input: string, extraction: Extraction): Extraction {
  return guardExtraction(extraction, input, cardFromParse(parseKorean(input, today), today, categories), categories, today);
}

describe("guardExtraction", () => {
  test("a title still carrying dates or times falls back to the rule title", () => {
    const input = "내일 오후 3시 팀 회의";

    expect(guard(input, { title: "내일 3시 팀 회의", kind: "event", category: "회사" }).title).toBe("팀 회의");
    expect(guard(input, { title: "팀 회의", kind: "event", category: "회사" }).title).toBe("팀 회의");
  });

  test("a meal word in the title is not a time", () => {
    expect(guard("내일 저녁 7시 강남역에서 민수랑 저녁 약속", { title: "민수랑 저녁 약속", kind: "event", category: "약속" }).title).toBe("민수랑 저녁 약속");
  });

  test("a task ending wins over the model's kind", () => {
    expect(guard("금요일까지 보고서 제출", { title: "보고서 제출", kind: "event", category: "회사" }).kind).toBe("task");
    expect(guard("내일 민수랑 저녁", { title: "민수랑 저녁", kind: "event", category: "약속" }).kind).toBe("event");
  });

  test("a category named in the sentence wins", () => {
    expect(guard("회사 우편물 발송", { title: "우편물 발송", kind: "task", category: "개인" }).category).toBe("회사");
    expect(guard("우편물 발송", { title: "우편물 발송", kind: "task", category: "개인" }).category).toBe("개인");
  });

  test("a place not written in the sentence is dropped", () => {
    const kept = guard("토요일 한강 러닝", { title: "러닝", kind: "event", category: "약속", place: "한강", placeGuessed: true });
    const dropped = guard("엄마 선물 사기", { title: "엄마 선물 사기", kind: "task", category: "약속", place: "집", placeGuessed: true });

    expect([kept.place, kept.placeGuessed]).toEqual(["한강", true]);
    expect([dropped.place, dropped.placeGuessed]).toEqual([undefined, undefined]);
  });

  test("a place that is really a date or time is dropped", () => {
    expect(guard("월요일 오전 9시 주간 회의", { title: "주간 회의", kind: "event", category: "회사", place: "월요일 오전 9시" }).place).toBeUndefined();
  });

  test("a note that just repeats the title is dropped", () => {
    const input = "이번 주 토요일 엄마 선물 사기";

    expect(guard(input, { title: "엄마 선물 사기", kind: "task", category: "약속", note: input }).note).toBeUndefined();
    expect(guard(input, { title: "엄마 선물 사기", kind: "task", category: "약속", note: "포장 부탁" }).note).toBe("포장 부탁");
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
