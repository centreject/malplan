// Scoring for the AI extraction eval: rules alone, the model alone, and the model guarded by rules.
import { cardFromParse } from "../../domain/card";
import type { IsoDate } from "../../domain/date";
import type { Category } from "../../domain/item";
import { hasDateOrTime, parseKorean } from "../../parse/parseKorean";
import { guardExtraction, type Extraction } from "../extract";
import { EVAL_CATEGORIES, type EvalRow } from "./cases";

export const FIELDS = ["title", "kind", "category", "place"] as const;

export type Field = (typeof FIELDS)[number];

export type Fields = Record<Field, string>;

export const EVAL_CATEGORY_LIST: Category[] = EVAL_CATEGORIES.map((name, index) => ({ id: `c${index}`, name, colorSlot: index }));

function options(text: string): string[] {
  return text.split("|").filter((option) => option !== "");
}

/** "점심|파스타+지수": one of the alternatives, and every "+" part (each may list "/" alternatives, e.g. the person). */
function titleMatches(spec: string, title: string): boolean {
  const [alternatives = "", ...required] = spec.split("+");

  return options(alternatives).some((word) => title.includes(word)) && required.every((part) => part.split("/").some((word) => title.includes(word)));
}

/** Which fields came out right. A title must hold an accepted word and no date or time words. */
export function grade(row: EvalRow, fields: Fields, today: IsoDate): Record<Field, boolean> {
  const [, title, kind, category, place] = row;

  return {
    title: titleMatches(title, fields.title) && !hasDateOrTime(fields.title, today),
    kind: fields.kind === (kind === "e" ? "event" : "task"),
    category: options(category).includes(fields.category),
    place: place === "*" || (place === "" ? fields.place === "" : options(place).some((word) => fields.place.includes(word))),
  };
}

export function ruleFields(input: string, today: IsoDate): Fields {
  const card = cardFromParse(parseKorean(input, today), today, EVAL_CATEGORY_LIST);

  return {
    title: card.title,
    kind: card.kind === "event" ? "event" : "task",
    category: EVAL_CATEGORY_LIST.find((c) => c.id === card.categoryId)?.name ?? "",
    place: "",
  };
}

function fromExtraction(extraction: Extraction): Fields {
  return { title: extraction.title, kind: extraction.kind, category: extraction.category, place: extraction.place ?? "" };
}

/** What the model said; unreadable replies fall back to the rules, as in the app. */
export function modelFields(input: string, extraction: Extraction | undefined, today: IsoDate): Fields {
  return extraction === undefined ? ruleFields(input, today) : fromExtraction(extraction);
}

/** What the app shows: the model's answer after the rule guards. */
export function guardedFields(input: string, extraction: Extraction | undefined, today: IsoDate): Fields {
  if (extraction === undefined) {
    return ruleFields(input, today);
  }

  const card = cardFromParse(parseKorean(input, today), today, EVAL_CATEGORY_LIST);

  return fromExtraction(guardExtraction(extraction, input, card, EVAL_CATEGORY_LIST, today));
}
