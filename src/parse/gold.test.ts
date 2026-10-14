import { describe, expect, test } from "vitest";
import goldText from "./fixtures/korean-datetime-gold.jsonl?raw";
import { parseGold, scoreGold, type CategoryScore } from "./goldScore";

// Ratchet: raise these when the parser improves; never lower them to pass.
const MIN_CORRECT = 434;

const MAX_FALSE_POSITIVES = 24;

const scores = scoreGold(parseGold(goldText));

function total(pick: (score: CategoryScore) => number): number {
  return [...scores.values()].reduce((sum, score) => sum + pick(score), 0);
}

describe("korean-datetime gold phrases", () => {
  test("report", () => {
    const rows = [...scores.entries()].map(([category, s]) => ({ category, ...s }));

    console.table(rows);
    console.log(`correct ${total((s) => s.correct)} / scored ${total((s) => s.correct + s.wrong + s.missed + s.falsePositive)}`);
  });

  test("correct answers do not drop", () => {
    expect(total((s) => s.correct)).toBeGreaterThanOrEqual(MIN_CORRECT);
  });

  test("false positives do not grow", () => {
    expect(total((s) => s.falsePositive)).toBeLessThanOrEqual(MAX_FALSE_POSITIVES);
  });
});
