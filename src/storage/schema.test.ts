import { expect, test } from "vitest";
import { emptySnapshot, parseLog, parseSnapshot } from "./schema";

const line = (ts: number, device = "A") =>
  JSON.stringify({ ts, device, entity: "item", id: "i1", field: "title", value: `t${ts}` });

test("parses JSON Lines, ignoring blank lines", () => {
  const { changes, errors } = parseLog(`${line(1)}\n\n${line(2)}\n`, "A");

  expect(changes.map((c) => c.ts)).toEqual([1, 2]);
  expect(errors).toEqual([]);
});

test("a corrupt line is skipped and reported; the rest of the file survives", () => {
  const text = [line(1), "{not json", JSON.stringify({ ts: "x" }), line(4)].join("\n");
  const { changes, errors } = parseLog(text, "A");

  expect(changes.map((c) => c.ts)).toEqual([1, 4]);
  expect(errors).toHaveLength(2);
  expect(errors[0]).toMatch(/^line 2:/);
  expect(errors[1]).toMatch(/^line 3:/);
});

test("a line claiming another device is rejected (each file belongs to one device)", () => {
  const { changes, errors } = parseLog(line(1, "B"), "A");

  expect(changes).toEqual([]);
  expect(errors).toHaveLength(1);
});

test("values may be any JSON, including nested objects", () => {
  const value = { kind: "exact", start: { h: 9, m: 0 }, tags: [1, null, "x"] };
  const text = JSON.stringify({ ts: 1, device: "A", entity: "item", id: "i", field: "time", value });

  expect(parseLog(text, "A").changes[0]?.value).toEqual(value);
});

test("snapshot round-trips", () => {
  const snapshot = { ...emptySnapshot(), compactedAt: 5, seen: { A: 3 } };

  expect(parseSnapshot(JSON.stringify(snapshot))).toEqual({ snapshot });
});

test("a corrupt snapshot is reported and yields an empty one", () => {
  const result = parseSnapshot('{"version":2}');

  expect(result.snapshot).toEqual(emptySnapshot());
  expect(result.error).toBeDefined();
});
