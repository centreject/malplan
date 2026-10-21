import * as v from "valibot";
import { parseStored, readStored, saveStored, writeStored } from "../storage/localStore";
import type { Correction } from "./extract";

const KEY = "malplan.llmCorrections";

/** Fixes kept on disk; buildPrompt picks the few that look like the current input. */
const MAX = 100;

// Older entries have no kind; they still load.
const Schema = v.array(v.object({ input: v.string(), category: v.string(), kind: v.optional(v.picklist(["event", "task"])) }));

/** Stored JSON → corrections; anything unreadable gives none. */
export function parseCorrections(stored: string | null): Correction[] {
  return parseStored(stored, Schema, []);
}

export function loadCorrections(): Correction[] {
  return parseCorrections(readStored(KEY));
}

export function addCorrections(added: Correction[]): void {
  if (added.length > 0) {
    saveStored(KEY, [...loadCorrections(), ...added].slice(-MAX));
  }
}

export function clearCorrections(): void {
  writeStored(KEY, undefined);
}
