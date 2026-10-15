import { describe, expect, test } from "vitest";
import { parseCorrections } from "./corrections";

describe("parseCorrections", () => {
  test("reads the older format without kind and the newer one with it", () => {
    expect(parseCorrections('[{"input":"사촌 결혼식","category":"약속"},{"input":"보고서","category":"회사","kind":"task"}]')).toEqual([
      { input: "사촌 결혼식", category: "약속" },
      { input: "보고서", category: "회사", kind: "task" },
    ]);
  });

  test("nothing stored or broken data gives none", () => {
    expect(parseCorrections(null)).toEqual([]);
    expect(parseCorrections("{")).toEqual([]);
    expect(parseCorrections('[{"input":"보고서","kind":"meeting"}]')).toEqual([]);
  });
});
