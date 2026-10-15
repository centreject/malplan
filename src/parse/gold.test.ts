import { describe, expect, test } from "vitest";
import goldText from "./fixtures/korean-datetime-gold.jsonl?raw";
import { parseGold, scoreGold, type CategoryScore } from "./goldScore";

// Ratchet: raise these when the parser improves; never lower them to pass.
const MIN_CORRECT = 844;

const MAX_FALSE_POSITIVES = 9;

const MIN_SCHEDULE_RATE = 0.716;

/**
 * Not counted in the schedule rate: whole months or years ("다음달" as a span; the app has no such item),
 * times relative to now ("10분 후"; the parser is given only today), and the no-date checks counted as false positives.
 */
const NOT_SCHEDULE = new Set(["month_year_range", "relative_time", "negative", "duration_not_date", "range_rejected"]);

const scores = scoreGold(parseGold(goldText));

function total(pick: (score: CategoryScore) => number, only: (category: string) => boolean = () => true): number {
  return [...scores.entries()].filter(([category]) => only(category)).reduce((sum, [, score]) => sum + pick(score), 0);
}

const scored = (s: CategoryScore) => s.correct + s.wrong + s.missed + s.falsePositive;

const isSchedule = (category: string) => !NOT_SCHEDULE.has(category);

const scheduleRate = total((s) => s.correct, isSchedule) / total(scored, isSchedule);

describe("korean-datetime gold phrases", () => {
  test("report", () => {
    console.table([...scores.entries()].map(([category, s]) => ({ category, ...s })));
    console.log(`correct ${total((s) => s.correct)} / scored ${total(scored)}`);
    console.log(`schedule expressions ${total((s) => s.correct, isSchedule)} / ${total(scored, isSchedule)} (${(scheduleRate * 100).toFixed(1)}%)`);
  });

  test("correct answers do not drop", () => {
    expect(total((s) => s.correct)).toBeGreaterThanOrEqual(MIN_CORRECT);
    expect(scheduleRate).toBeGreaterThanOrEqual(MIN_SCHEDULE_RATE);
  });

  test("false positives do not grow", () => {
    expect(total((s) => s.falsePositive)).toBeLessThanOrEqual(MAX_FALSE_POSITIVES);
  });
});
