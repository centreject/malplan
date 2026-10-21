import { describe, expect, test } from "vitest";
import type { EvalRow } from "./cases";
import { grade, ruleFields } from "./score";

const today = "2026-10-12";

describe("grade", () => {
  const row: EvalRow = ["내일 저녁 7시 강남역에서 민수랑 저녁 약속", "민수", "e", "약속|개인", "강남"];

  test("alternatives and substrings count", () => {
    expect(grade(row, { title: "민수와 저녁", kind: "event", category: "개인", place: "강남역" }, today)).toEqual({
      title: true,
      kind: true,
      category: true,
      place: true,
    });
  });

  test("a title with date words, a wrong kind, or a made-up place fails", () => {
    expect(grade(row, { title: "내일 민수", kind: "task", category: "회사", place: "집" }, today)).toEqual({
      title: false,
      kind: false,
      category: false,
      place: false,
    });
  });

  test("an absent place must stay empty", () => {
    const noPlace: EvalRow = ["금요일까지 과제 제출", "과제", "t", "학교", ""];

    expect(grade(noPlace, ruleFields(noPlace[0], today), today)).toEqual({ title: true, kind: true, category: false, place: true });
  });
});
