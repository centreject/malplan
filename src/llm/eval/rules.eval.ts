// Rules-only extraction score (no AI server): what users without a model, or with AI off, get.
// Run: npm run bench:rules. DEV misses are listed for tuning; HELD prints totals only and is never tuned on.
import { describe, test } from "vitest";
import { DEV, HELD, type EvalRow } from "./cases";
import { FIELDS, grade, ruleFields, type Field } from "./score";

const today = "2026-10-12";

function score(rows: EvalRow[]) {
  const tally: Record<Field, number> = { title: 0, kind: 0, category: 0, place: 0 };
  const misses: string[] = [];

  for (const row of rows) {
    const fields = ruleFields(row[0], today);
    const result = grade(row, fields, today);

    for (const field of FIELDS) {
      tally[field] += result[field] ? 1 : 0;
    }

    if (!result.category) {
      misses.push(`  ${row[0]} → ${fields.category} (정답 ${row[3]})`);
    }
  }

  return { tally, misses };
}

describe("rules only", () => {
  test("dev", () => {
    const { tally, misses } = score(DEV);

    console.log(`dev (${DEV.length}): ${FIELDS.map((field) => `${field} ${tally[field]}`).join(", ")}`);
    console.log(`category misses:\n${misses.join("\n")}`);
  });

  test("held", () => {
    const { tally } = score(HELD);

    console.log(`held (${HELD.length}): ${FIELDS.map((field) => `${field} ${tally[field]}`).join(", ")}`);
  });
});
