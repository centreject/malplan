// Scores parseKorean against the korean-datetime gold phrases (fixtures/korean-datetime-gold.jsonl).
// Each row holds the expected value already resolved at a reference time, so no expression
// evaluator lives here: the comparison only maps their [start, end) spans onto our parse result.
import * as v from "valibot";
import { addDays, dayNumber } from "../domain/date";
import { parseKorean, type ClockTime, type ParseResult } from "./parseKorean";

const GoldRowSchema = v.object({
  category: v.string(),
  text: v.string(),
  expect: v.string(),
  ref: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  kind: v.optional(v.picklist(["date", "time", "datetime"])),
  start: v.optional(v.string()),
  end: v.optional(v.string()),
});

export type GoldRow = v.InferOutput<typeof GoldRowSchema>;

/** correct, wrong value, nothing found, found something in a phrase with no date, or needs the clock. */
export type Verdict = "correct" | "wrong" | "missed" | "falsePositive" | "skipped";

export type CategoryScore = Record<Verdict, number>;

export function parseGold(jsonl: string): GoldRow[] {
  return jsonl
    .split("\n")
    .flatMap((line) => (line.trim() === "" ? [] : [v.parse(GoldRowSchema, JSON.parse(line))]));
}

export function judge(row: GoldRow): Verdict {
  const parsed = parseKorean(row.text, row.ref.slice(0, 10));
  const found = parsed.date !== undefined || parsed.time !== undefined;

  if (row.kind === undefined || row.start === undefined) {
    return found ? "falsePositive" : "correct";
  }

  // "now + 10min" needs the time of day, which the parser is never given.
  if (/\bnow\b/.test(row.expect)) {
    return "skipped";
  }

  if (!found) {
    return "missed";
  }

  return matches(row.kind, row.start, row.end, row.expect, parsed) ? "correct" : "wrong";
}

function matches(kind: "date" | "time" | "datetime", start: string, end: string | undefined, expect: string, parsed: ParseResult): boolean {
  const startDate = start.slice(0, 10);

  if (kind === "date") {
    const lastDate = end === undefined ? startDate : addDays(end.slice(0, 10), -1);

    return lastDate === startDate
      ? parsed.date?.kind === "single" && parsed.date.date === startDate
      : parsed.date?.kind === "range" && parsed.date.start === startDate && parsed.date.end === lastDate;
  }

  const timeOk = parsed.time?.kind === "exact" && sameClock(parsed.time.start, start.slice(11, 16), expect.includes("nearest"));

  return kind === "time" ? timeOk : timeOk && sameDay(parsed, startDate);
}

/** "3시" resolves to the nearest 3 o'clock there; this app guesses PM and lets the user confirm, so either half counts. */
function sameClock(clock: ClockTime, expected: string, eitherHalf: boolean): boolean {
  const hour = Number(expected.slice(0, 2));
  const minute = Number(expected.slice(3, 5));

  return clock.minute === minute && (eitherHalf ? clock.hour % 12 === hour % 12 : clock.hour % 24 === hour);
}

function sameDay(parsed: ParseResult, date: string): boolean {
  return parsed.date?.kind === "single" && dayNumber(parsed.date.date) === dayNumber(date);
}

export function scoreGold(rows: GoldRow[]): Map<string, CategoryScore> {
  const scores = new Map<string, CategoryScore>();

  for (const row of rows) {
    const score = scores.get(row.category) ?? { correct: 0, wrong: 0, missed: 0, falsePositive: 0, skipped: 0 };

    score[judge(row)] += 1;
    scores.set(row.category, score);
  }

  return scores;
}
