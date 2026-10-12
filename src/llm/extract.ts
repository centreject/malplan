// The LLM's one job: title, kind, category, place and note for one parsed part.
// Dates, times and recurrence never come from the model; code already computed them.
import * as v from "valibot";
import { guessKind, NEW_CATEGORY, type Card } from "../domain/card";
import type { IsoDate } from "../domain/date";
import type { Category } from "../domain/item";
import { parseKorean } from "../parse/parseKorean";

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
    "JSON 객체 하나만 출력하라. 설명이나 다른 글은 쓰지 마라. 모든 값은 한국어로 쓴다.",
    '- "title": 짧은 제목. 날짜·시간·반복 표현은 뺀다.',
    '- "kind": 정해진 때에 가거나 만나거나 참석하는 것은 "event", 끝내야 하는 일은 "task".',
    '- "category": 분류 목록 중 하나를 그대로 쓴다. 정말 맞는 것이 없을 때만 새 이름(2~4글자).',
    '- "place": 문장에 장소가 적혀 있을 때만 그 말 그대로. 없으면 이 필드를 빼라. 장소를 지어내지 마라.',
    '- "placeGuessed": place가 장소인지 확실하지 않으면 true.',
    '- "note": 제목에 못 담은 중요한 정보만(준비물, 거리 등). 없으면 이 필드를 빼라.',
    "분류 목록: " + categories.map((c) => c.name).join(", "),
    "예시 (분류 목록이 회사, 개인, 운동일 때):",
    '"내일 오후 3시 본사 3층에서 분기 실적 발표" → {"title":"분기 실적 발표","kind":"event","category":"회사","place":"본사 3층"}',
    '"주말에 안경 맞추러 가기" → {"title":"안경 맞추기","kind":"task","category":"개인"}',
    '"매주 화목 저녁 수영 강습 수영복 챙기기" → {"title":"수영 강습","kind":"event","category":"운동","note":"수영복 챙기기"}',
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

/**
 * Rules overrule the model where they are surer: a title still holding dates, a task ending,
 * a category named in the sentence, a place the sentence never mentions (or that is a date), a note that repeats the title.
 */
export function guardExtraction(
  extraction: Extraction,
  input: string,
  ruleCard: Card,
  categories: Category[],
  today: IsoDate,
): Extraction {
  const named = categories.find((c) => input.includes(c.name));
  const { place, placeGuessed, note, ...rest } = extraction;

  const guarded: Extraction = {
    ...rest,
    title: hasDateOrTime(extraction.title, today) ? ruleCard.title : extraction.title,
    kind: guessKind(ruleCard.title) === "task" ? "task" : extraction.kind,
    category: named?.name ?? extraction.category,
  };

  if (place !== undefined && place !== "" && input.includes(place) && !hasDateOrTime(place, today)) {
    guarded.place = place;

    if (placeGuessed !== undefined) {
      guarded.placeGuessed = placeGuessed;
    }
  }

  if (note !== undefined && !note.includes(guarded.title)) {
    guarded.note = note;
  }

  return guarded;
}

function hasDateOrTime(text: string, today: IsoDate): boolean {
  const parsed = parseKorean(text, today);

  return parsed.date !== undefined || parsed.time !== undefined;
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
