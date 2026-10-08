import type { IsoDate } from "./date";
import type { Recurrence } from "./recurrence";
import type { ClockTime, Slot } from "../parse/parseKorean";

export type ItemTime =
  | { kind: "exact"; start: ClockTime; end?: ClockTime }
  | { kind: "slot"; slot: Slot }
  /** Time to be decided later. */
  | { kind: "undecided" }
  /** Any time that day. */
  | { kind: "anytime" };

export type ItemWhen =
  | { kind: "single"; date: IsoDate }
  | { kind: "range"; start: IsoDate; end: IsoDate }
  | { kind: "recurring"; rule: Recurrence }
  /** Undated todo. */
  | { kind: "none" };

export type Item = {
  id: string;
  title: string;
  /** "event" has no checkbox; "task" can be completed. */
  kind: "event" | "task";
  categoryId: string;
  when: ItemWhen;
  time: ItemTime;
  /** Completed occurrence dates (recurring tasks complete per occurrence). Undated: "done". */
  done: string[];
  place?: string;
  note?: string;
  /** Reminder this many minutes before the start. Delivery is not built yet. */
  remindMinutes?: number;
};

export type Category = {
  id: string;
  name: string;
  /** Palette slot 1..6; each theme maps slots to its own colours. */
  colorSlot: number;
};
