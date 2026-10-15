// AI extraction eval against a running local llama-server. Not part of `npm test`.
// Start the server, then: npm run bench:llm   (only one set: npm run bench:llm -- -t held)
import { describe, test } from "vitest";
import { buildPrompt, parseExtraction } from "../extract";
import { chatBody, LOCAL_ENDPOINT } from "../providers";
import { DEV, HELD, type EvalRow } from "./cases";
import { EVAL_CATEGORY_LIST, FIELDS, grade, guardedFields, modelFields, otherRowsAsItems, ruleFields, type Field, type Fields } from "./score";

const today = "2026-10-12";

async function ask(input: string): Promise<{ reply: string; ms: number }> {
  const prompt = buildPrompt(input, EVAL_CATEGORY_LIST, [], today);
  const started = performance.now();

  // Same request as the app, reply schema included.
  const response = await fetch(LOCAL_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: chatBody(LOCAL_ENDPOINT, "local", prompt),
  });

  // SAFETY: llama-server's OpenAI-compatible reply; a malformed one just scores as unreadable.
  const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };

  return { reply: json.choices?.[0]?.message?.content ?? "", ms: performance.now() - started };
}

type Tally = Record<Field, number>;

function emptyTally(): Tally {
  return { title: 0, kind: 0, category: 0, place: 0 };
}

function add(tally: Tally, row: EvalRow, fields: Fields): string[] {
  const result = grade(row, fields, today);

  for (const field of FIELDS) {
    tally[field] += result[field] ? 1 : 0;
  }

  return FIELDS.filter((field) => !result[field]);
}

async function run(name: string, rows: EvalRow[]): Promise<void> {
  const tallies = { rules: emptyTally(), model: emptyTally(), app: emptyTally(), "app+history": emptyTally() };
  const times: number[] = [];
  const misses: string[] = [];

  for (const row of rows) {
    const input = row[0];
    const { reply, ms } = await ask(input);
    const extraction = parseExtraction(reply);
    const shown = guardedFields(input, extraction, [], today);

    times.push(ms);
    add(tallies.rules, row, ruleFields(input, today));
    add(tallies.model, row, modelFields(input, extraction, today));
    add(tallies["app+history"], row, guardedFields(input, extraction, otherRowsAsItems(rows, row), today));

    const missed = add(tallies.app, row, shown);

    if (missed.length > 0) {
      misses.push(`${input} → ${JSON.stringify(shown)} [${missed.join(",")}]`);
    }
  }

  const sorted = times.toSorted((a, b) => a - b);
  const max = rows.length * FIELDS.length;

  console.log(`\n## ${name} (${rows.length} sentences)`);
  console.table(
    Object.entries(tallies).map(([setup, tally]) => {
      const total = FIELDS.reduce((sum, field) => sum + tally[field], 0);

      return { setup, ...tally, total: `${total}/${max} (${Math.round((total / max) * 100)}%)` };
    }),
  );
  console.log(`first ${(times[0] ?? 0).toFixed(0)}ms, median ${(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(0)}ms`);
  console.log(misses.join("\n"));
}

describe("local model extraction", () => {
  test("dev", { timeout: 600_000 }, async () => {
    await run("dev", DEV);
  });

  test("held", { timeout: 600_000 }, async () => {
    await run("held", HELD);
  });
});
