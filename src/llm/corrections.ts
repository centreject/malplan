import * as v from "valibot";
import type { Correction } from "./extract";

const KEY = "malplan.llmCorrections";

/** Only the most recent fixes are sent as examples. */
const MAX = 20;

const Schema = v.array(v.object({ input: v.string(), category: v.string() }));

export function loadCorrections(): Correction[] {
  try {
    const parsed = v.safeParse(Schema, JSON.parse(window.localStorage.getItem(KEY) ?? "[]"));

    return parsed.success ? parsed.output : [];
  } catch {
    return [];
  }
}

export function addCorrections(added: Correction[]): void {
  if (added.length === 0) {
    return;
  }

  try {
    window.localStorage.setItem(KEY, JSON.stringify([...loadCorrections(), ...added].slice(-MAX)));
  } catch {
    // Storage unavailable: the model just doesn't learn this one.
  }
}

export function clearCorrections(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
