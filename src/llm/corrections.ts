import * as v from "valibot";
import type { Correction } from "./extract";

const KEY = "malplan.llmCorrections";

/** Fixes kept on disk; buildPrompt picks the few that look like the current input. */
const MAX = 100;

// Older entries have no kind; they still load.
const Schema = v.array(v.object({ input: v.string(), category: v.string(), kind: v.optional(v.picklist(["event", "task"])) }));

/** Stored JSON → corrections; anything unreadable gives none. */
export function parseCorrections(stored: string | null): Correction[] {
  try {
    const parsed = v.safeParse(Schema, JSON.parse(stored ?? "[]"));

    return parsed.success ? parsed.output : [];
  } catch {
    return [];
  }
}

export function loadCorrections(): Correction[] {
  try {
    return parseCorrections(window.localStorage.getItem(KEY));
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
