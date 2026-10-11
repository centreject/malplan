// The LLM's one job: title, kind, category, place and note for one parsed part.
// Dates, times and recurrence never come from the model; code already computed them.
import * as v from "valibot";
import { NEW_CATEGORY, type Card } from "../domain/card";
import type { IsoDate } from "../domain/date";
import type { Category } from "../domain/item";

const ExtractionSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1)),
  kind: v.picklist(["event", "task"]),
  category: v.pipe(v.string(), v.trim(), v.minLength(1)),
  place: v.optional(v.pipe(v.string(), v.trim())),
  placeGuessed: v.optional(v.boolean()),
  note: v.optional(v.pipe(v.string(), v.trim())),
});

export type Extraction = v.InferOutput<typeof ExtractionSchema>;

/** A past fix the user made, fed back as an example. */
export type Correction = { input: string; category: string };

/** Card fields the user has touched in the dialog; the model never overwrites them. */
export type EditedField = "title" | "kind" | "categoryId" | "place" | "note";

export type Prompt = { system: string; user: string };

export function buildPrompt(
  input: string,
  categories: Category[],
  corrections: Correction[],
  today: IsoDate,
): Prompt {
  const examples = corrections
    .map((c) => `- "${c.input}" → 분류 "${c.category}"`)
    .join("\n");

  const system = [
    "너는 한국어 일정 문장에서 정보를 뽑는 도우미다. 오늘은 " + today + "이다.",
    "날짜·시간·반복은 이미 코드가 계산했으니 절대 다루지 마라.",
    "다음 필드만 담은 JSON 객체 하나만 출력하라. 설명이나 다른 글은 쓰지 마라.",
    '{"title": 짧은 제목(날짜·시간 표현 제외), "kind": "event"(약속·일정) 또는 "task"(해야 할 일),',
    ' "category": 아래 분류 중 가장 알맞은 이름, 없으면 새 분류 이름 하나,',
    ' "place": 장소(문장에 없으면 생략), "placeGuessed": 장소를 추측했으면 true,',
    ' "note": 남길 메모(없으면 생략)}',
    "분류 목록: " + categories.map((c) => c.name).join(", "),
    examples === "" ? "" : "사용자가 예전에 고친 예:\n" + examples,
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { system, user: input };
}

/** First {...} block in the reply, validated. Anything unusable gives undefined. */
export function parseExtraction(reply: string): Extraction | undefined {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");

  if (start === -1 || end <= start) {
    return undefined;
  }

  try {
    const parsed = v.safeParse(ExtractionSchema, JSON.parse(reply.slice(start, end + 1)));

    return parsed.success ? parsed.output : undefined;
  } catch {
    return undefined;
  }
}

/** Merge the model's answer into the card, skipping fields the user already edited. */
export function applyExtraction(card: Card, extraction: Extraction, categories: Category[], edited: EditedField[]): Card {
  const next: Card = { ...card };
  const keep = (field: EditedField) => edited.includes(field);

  if (!keep("title")) {
    next.title = extraction.title;
  }

  // "Undated" is a date decision the parser made; the model only splits event vs task.
  if (!keep("kind") && card.kind !== "undated") {
    next.kind = extraction.kind;
  }

  if (!keep("categoryId")) {
    const existing = categories.find((c) => c.name === extraction.category);

    next.categoryId = existing?.id ?? NEW_CATEGORY;
    next.newCategory = existing === undefined ? extraction.category : "";
  }

  if (!keep("place") && extraction.place !== undefined && extraction.place !== "") {
    next.place = extraction.place;

    if (extraction.placeGuessed === true && !card.flags.includes("placeGuessed")) {
      next.flags = [...card.flags, "placeGuessed"];
    }
  }

  if (!keep("note") && extraction.note !== undefined && extraction.note !== "") {
    next.note = extraction.note;
  }

  return next;
}
