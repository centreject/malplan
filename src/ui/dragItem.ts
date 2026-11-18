// Dragging an item from one day to another in the week and month panes.
import type { DragEvent } from "react";
import * as v from "valibot";
import type { IsoDate } from "../domain/date";

/** Only our own drags carry this type: text or files dragged in from elsewhere are not drops. */
const TYPE = "application/x-malplan-item";

const DraggedSchema = v.object({ id: v.string(), date: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/)) });

export type Dragged = v.InferOutput<typeof DraggedSchema>;

export function startDrag(event: DragEvent, id: string, date: IsoDate): void {
  event.dataTransfer.setData(TYPE, JSON.stringify({ id, date }));
  event.dataTransfer.effectAllowed = "move";
}

/** Whether a drag over a day is one of ours (its data can only be read on drop). */
export function isItemDrag(event: DragEvent): boolean {
  return event.dataTransfer.types.includes(TYPE);
}

export function droppedItem(event: DragEvent): Dragged | undefined {
  try {
    const parsed = v.safeParse(DraggedSchema, JSON.parse(event.dataTransfer.getData(TYPE)));

    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
}
