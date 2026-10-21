// AI fallback for "말로 고치기" requests the rules cannot read ("민수도 같이 가는 걸로", "회식으로 바꿔").
// The model only names changed fields; dates and times stay with the rules.
import * as v from "valibot";
import type { Card } from "../domain/card";
import { editResult, type EditResult } from "../domain/editCommand";
import type { Category } from "../domain/item";
import { NEW_CATEGORY_CHOICE, parseReplyJson, replySchema, type Prompt } from "./extract";

const PatchSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.trim())),
  kind: v.optional(v.picklist(["event", "task"])),
  category: v.optional(v.string()),
  place: v.optional(v.pipe(v.string(), v.trim())),
  note: v.optional(v.pipe(v.string(), v.trim())),
});

export function buildEditPrompt(card: Card, request: string, categories: Category[]): Prompt {
  const current = {
    title: card.title,
    kind: card.kind === "task" ? "task" : "event",
    category: categories.find((c) => c.id === card.categoryId)?.name ?? "",
    place: card.place,
    note: card.note,
  };

  const system = [
    "너는 일정 항목을 고치는 도우미다. 현재 항목과 사용자의 수정 요청을 보고, 바뀌는 필드만 담은 JSON 객체 하나만 출력하라.",
    "날짜·시간은 이미 코드가 처리했으니 절대 다루지 마라. 바뀌지 않는 필드는 빼라. 모든 값은 한국어로 쓴다.",
    '필드: "title"(함께하는 사람이 있으면 제목에), "kind"("event" 또는 "task"), "category"(분류 목록 중 하나), "place", "note".',
    "분류 목록: " + categories.map((c) => c.name).join(", "),
    "현재 항목: " + JSON.stringify(current),
  ].join("\n");

  return { system, user: request, schema: { ...replySchema(categories), required: [] } };
}

/** The model's patch applied to the card; unreadable or empty replies give undefined. */
export function applyEditReply(card: Card, reply: string, categories: Category[]): EditResult | undefined {
  const patch = parseReplyJson(reply, PatchSchema);

  if (patch === undefined) {
    return undefined;
  }

  const next: Card = { ...card };
  const category = categories.find((c) => c.name === patch.category && patch.category !== NEW_CATEGORY_CHOICE);

  if (patch.title !== undefined && patch.title !== "") {
    next.title = patch.title;
  }

  if (patch.kind !== undefined && card.kind !== "undated") {
    next.kind = patch.kind;
  }

  if (category !== undefined) {
    next.categoryId = category.id;
  }

  if (patch.place !== undefined) {
    next.place = patch.place;
  }

  if (patch.note !== undefined) {
    next.note = patch.note;
  }

  return editResult(card, next, categories);
}
