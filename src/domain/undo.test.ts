import { expect, test } from "vitest";
import { revertChange } from "./undo";

type Row = { id: string; v: number };

test("undo reverts only the records the action touched, keeping later changes", () => {
  const a = { id: "a", v: 1 };
  const b = { id: "b", v: 1 };
  const c = { id: "c", v: 1 };
  const d = { id: "d", v: 1 };
  const before: Row[] = [a, b, c];
  // The action: edit a, delete b, add d; c is untouched (same object).
  const after: Row[] = [{ id: "a", v: 2 }, c, d];
  // Then c was checked off and e arrived by sync.
  const current: Row[] = [{ id: "a", v: 2 }, { id: "c", v: 9 }, d, { id: "e", v: 1 }];

  expect(revertChange(current, before, after)).toEqual([a, b, { id: "c", v: 9 }, { id: "e", v: 1 }]);
});
