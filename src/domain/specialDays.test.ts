import { expect, test } from "vitest";
import { isStale, normalizeKey, specialDaysUrl } from "./specialDays";

test("an Encoding key and its Decoding form normalize to the same key", () => {
  expect(normalizeKey("abc%2Bdef%3D%3D")).toBe("abc+def==");
  expect(normalizeKey("  abc+def==  ")).toBe("abc+def==");
});

test("request URL encodes the key exactly once", () => {
  const url = new URL(specialDaysUrl("abc+def==", 2026));

  expect(url.origin + url.pathname).toBe("https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo");
  expect(url.searchParams.get("serviceKey")).toBe("abc+def==");
  expect(url.searchParams.get("solYear")).toBe("2026");
  expect(url.searchParams.get("_type")).toBe("json");
  expect(url.searchParams.get("numOfRows")).toBe("100");
});

test("cache is stale after a week or when a year is missing", () => {
  const day = 24 * 60 * 60 * 1000;
  const cache = { fetchedAt: 0, years: [2026] };

  expect(isStale(cache, [2026], 6 * day)).toBe(false);
  expect(isStale(cache, [2026], 8 * day)).toBe(true);
  expect(isStale(cache, [2026, 2027], 1 * day)).toBe(true);
  expect(isStale(undefined, [2026], 0)).toBe(true);
});
