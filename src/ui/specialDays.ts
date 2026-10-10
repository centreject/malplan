import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { useEffect, useMemo, useState } from "react";
import * as v from "valibot";
import type { IsoDate } from "../domain/date";
import { parseSpecialDays } from "../domain/holidays";
import { isStale, normalizeKey, specialDaysUrl } from "../domain/specialDays";

const KEY_STORAGE = "malplan.holidayApiKey";

const CACHE_STORAGE = "malplan.specialDays";

const CacheSchema = v.object({
  fetchedAt: v.number(),
  years: v.array(v.number()),
  days: v.array(v.tuple([v.string(), v.string()])),
});

type Cache = v.InferOutput<typeof CacheSchema>;

export type SpecialDaysStatus =
  | { kind: "off" }
  | { kind: "loading" }
  | { kind: "ok"; fetchedAt: number }
  | { kind: "error"; message: string; fetchedAt: number | undefined };

export function loadApiKey(): string {
  try {
    return window.localStorage.getItem(KEY_STORAGE) ?? "";
  } catch {
    return "";
  }
}

export function saveApiKey(key: string): void {
  try {
    window.localStorage.setItem(KEY_STORAGE, normalizeKey(key));
  } catch {
    // Storage unavailable: the key lasts for this session only.
  }
}

function loadCache(): Cache | undefined {
  try {
    const parsed = v.safeParse(CacheSchema, JSON.parse(window.localStorage.getItem(CACHE_STORAGE) ?? "null"));

    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
}

function saveCache(cache: Cache): void {
  try {
    window.localStorage.setItem(CACHE_STORAGE, JSON.stringify(cache));
  } catch {
    // Storage unavailable: refetch next time.
  }
}

/** data.go.kr sends no CORS headers, so the desktop app fetches through the Rust HTTP plugin. */
async function fetchYear(key: string, year: number): Promise<Map<IsoDate, string>> {
  const url = specialDaysUrl(key, year);
  const response = isTauri() ? await tauriFetch(url) : await window.fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  try {
    return parseSpecialDays(await response.text());
  } catch {
    // Wrong or expired keys come back as an XML error page instead of JSON.
    throw new Error("응답을 읽을 수 없습니다. 키가 틀렸거나 만료되었을 수 있습니다.");
  }
}

/**
 * Announced holidays (임시공휴일, 선거일) from the API, cached and refreshed weekly. Failures keep the
 * last cache and are only reported in settings: computed holidays never depend on this.
 */
export function useSpecialDays(apiKey: string, years: number[], now: number) {
  const [cache, setCache] = useState(loadCache);
  const [failure, setFailure] = useState<string>();
  const yearList = years.join(",");
  const wanted = yearList.split(",").map(Number);
  const stale = isStale(cache, wanted, now);

  useEffect(() => {
    if (apiKey === "" || !stale) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const maps = await Promise.all(yearList.split(",").map((year) => fetchYear(apiKey, Number(year))));
        const next: Cache = { fetchedAt: now, years: yearList.split(",").map(Number), days: maps.flatMap((map) => [...map]) };

        if (!cancelled) {
          saveCache(next);
          setCache(next);
          setFailure(undefined);
        }
      } catch (error) {
        if (!cancelled) {
          setFailure(error instanceof Error ? error.message : String(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiKey, yearList, now, stale]);

  const status: SpecialDaysStatus =
    apiKey === ""
      ? { kind: "off" }
      : failure !== undefined
        ? { kind: "error", message: failure, fetchedAt: cache?.fetchedAt }
        : stale
          ? { kind: "loading" }
          : { kind: "ok", fetchedAt: cache?.fetchedAt ?? now };

  const supplement = useMemo(() => new Map(cache?.days ?? []), [cache]);

  return { supplement, status };
}
