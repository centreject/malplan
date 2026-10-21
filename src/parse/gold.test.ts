import { describe, expect, test } from "vitest";
import goldText from "./fixtures/korean-datetime-gold.jsonl?raw";
import { parseGold, scoreGold, type CategoryScore } from "./goldScore";

// Ratchet: raise these when the parser improves; never lower them to pass.
// Lowered once on 2026-10-15 (984 → 960, 86.4% → 84.0%) by deliberate choices that differ from the gold set, after a
// review of ~420 everyday inputs: "N일 전" alone is no longer counted back from today ("회의 3일 전에 자료 공유"),
// "첫째 주 금요일" is the first Friday rather than the Friday of the first calendar row, and "이번 주 X요일" already
// past means the coming one. Raised on 2026-10-22 (960 → 984, 84.1% → 86.7%): 지난 + date, "A가 아니라 B", 어젯밤,
// 퇴근하고, a year-end range, 이십구일.
const MIN_CORRECT = 984;

const MAX_FALSE_POSITIVES = 9;

const MIN_SCHEDULE_RATE = 0.867;

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
