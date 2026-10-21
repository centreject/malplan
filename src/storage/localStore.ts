// Small settings and caches in localStorage. Storage can be unavailable (blocked site data, private
// windows), so every read degrades to "nothing stored" and a failed write lasts for this session only.
import * as v from "valibot";

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** undefined removes the key. */
export function writeStored(key: string, value: string | undefined): void {
  try {
    if (value === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Storage unavailable.
  }
}

/** Stored JSON, validated; nothing stored, not JSON, or failing the schema gives the fallback. */
export function parseStored<S extends v.GenericSchema, F>(raw: string | null, schema: S, fallback: F): v.InferOutput<S> | F {
  if (raw === null) {
    return fallback;
  }

  try {
    const parsed = v.safeParse(schema, JSON.parse(raw));

    return parsed.success ? parsed.output : fallback;
  } catch {
    return fallback;
  }
}

export function loadStored<S extends v.GenericSchema, F>(key: string, schema: S, fallback: F): v.InferOutput<S> | F {
  return parseStored(readStored(key), schema, fallback);
}

export function saveStored<T>(key: string, value: T): void {
  writeStored(key, JSON.stringify(value));
}
