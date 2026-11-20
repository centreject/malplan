// AI fallback for "말로 고치기" requests the rules cannot read ("민수도 같이 가는 걸로", "회식으로 바꿔").
// The model only names changed fields; dates and times stay with the rules.
import * as v from "valibot";
import type { Card } from "../domain/card";
import { editResult, type EditResult } from "../domain/editCommand";
import type { Category } from "../domain/item";
import { parseReplyJson, type Prompt, type ReplyJsonSchema } from "./extract";

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

  return { system, user: request, schema: editSchema(categories) };
}

/** The five fields an edit names, none required: only what changes. */
function editSchema(categories: Category[]): ReplyJsonSchema {
  const text = { type: "string" } as const;

  return {
    type: "object",
    properties: { title: text, kind: { enum: ["event", "task"] }, category: { enum: categories.map((c) => c.name) }, place: text, note: text },
    required: [],
  };
}

/** "장소 지워", "메모 없애": only then may an empty place or note clear what is there, each the one it names. */
const CLEARS = "(?:지워|지우|없애|빼|비워|삭제)";

/**
 * The model's patch applied to the card; unreadable or empty replies give undefined. A model may answer an
 * unchanged field with "": that clears it only when `request` asks to remove something.
 */
export function applyEditReply(card: Card, reply: string, categories: Category[], request: string): EditResult | undefined {
  const patch = parseReplyJson(reply, PatchSchema);

  if (patch === undefined) {
    return undefined;
  }

  const next: Card = { ...card };
  const category = categories.find((c) => c.name === patch.category);
  const clearsPlace = new RegExp(`장소.*${CLEARS}`).test(request);
  const clearsNote = new RegExp(`메모.*${CLEARS}`).test(request);

  if (patch.title !== undefined && patch.title !== "") {
    next.title = patch.title;
  }

  if (patch.kind !== undefined && card.kind !== "undated") {
    next.kind = patch.kind;
  }

  if (category !== undefined) {
    next.categoryId = category.id;
  }

  if (patch.place !== undefined && (patch.place !== "" || clearsPlace)) {
    next.place = patch.place;
  }

  if (patch.note !== undefined && (patch.note !== "" || clearsNote)) {
    next.note = patch.note;
  }

  return editResult(card, next, categories);
}
