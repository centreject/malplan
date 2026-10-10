// 공공데이터포털 한국천문연구원 특일정보 (getRestDeInfo): adds announced holidays such as
// 임시공휴일 and election days to the computed ones. Pure helpers; fetching lives in the UI layer.

const ENDPOINT = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";

/** Refresh weekly: temporary holidays are announced days to weeks ahead. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The portal shows an "Encoding" and a "Decoding" key. Accept either: decode once, so the
 * URL encoder below encodes exactly once.
 */
export function normalizeKey(key: string): string {
  const trimmed = key.trim();

  try {
    return trimmed.includes("%") ? decodeURIComponent(trimmed) : trimmed;
  } catch {
    return trimmed;
  }
}

export function specialDaysUrl(key: string, year: number): string {
  const url = new URL(ENDPOINT);

  url.searchParams.set("serviceKey", key);
  url.searchParams.set("solYear", String(year));
  url.searchParams.set("numOfRows", "100");
  url.searchParams.set("_type", "json");

  return url.toString();
}

export type SpecialDaysCache = { fetchedAt: number; years: number[] };

export function isStale(cache: SpecialDaysCache | undefined, years: number[], now: number): boolean {
  return cache === undefined || now - cache.fetchedAt > MAX_AGE_MS || years.some((year) => !cache.years.includes(year));
}
