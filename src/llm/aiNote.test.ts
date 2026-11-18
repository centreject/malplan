import { expect, test } from "vitest";
import { UNREADABLE_REPLY, aiFailureNote } from "./aiNote";

const ok: PromiseSettledResult<unknown> = { status: "fulfilled", value: undefined };

const failed = (reason: Error): PromiseSettledResult<unknown> => ({ status: "rejected", reason });

test("nothing to say when every sentence came through", () => {
  expect(aiFailureNote([ok, ok], "gemini", undefined)).toBeUndefined();
});

test("some sentences failed: says how many, with the reason of the first", () => {
  expect(aiFailureNote([ok, failed(new Error("HTTP 401")), ok], "gemini", undefined)).toMatch(/^3개 중 1개만 해당 · AI 정리 실패: .*\(HTTP 401\)/);
});

test("all failed: just the reason", () => {
  expect(aiFailureNote([failed(new Error("HTTP 500"))], "openrouter", undefined)).toMatch(/^AI 정리 실패: .*\(HTTP 500\) 규칙 기반 결과를 확인하세요\.$/);
});

test("an unreadable reply and the local model's states each say what happened", () => {
  expect(aiFailureNote([failed(new Error(UNREADABLE_REPLY))], "local", "ready")).toBe("AI 답을 읽지 못해 규칙 기반으로만 정리했습니다.");
  expect(aiFailureNote([failed(new Error("fetch failed"))], "local", "no-model")).toMatch(/^로컬 AI 모델이 없어/);
  expect(aiFailureNote([ok, failed(new Error("fetch failed"))], "local", "starting")).toBe("2개 중 1개만 해당 · 로컬 AI 모델이 아직 준비되지 않아 규칙 기반으로만 정리했습니다.");
});
