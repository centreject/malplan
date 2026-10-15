// Scoring for the AI extraction eval: rules alone, the model alone, and the model guarded by rules.
import { cardFromParse } from "../../domain/card";
import type { IsoDate } from "../../domain/date";
import type { Category } from "../../domain/item";
import { hasDateOrTime, parseKorean } from "../../parse/parseKorean";
import { guardExtraction, type Extraction, type SavedItem } from "../extract";
import { EVAL_CATEGORIES, type EvalRow } from "./cases";

export const FIELDS = ["title", "kind", "category", "place"] as const;

export type Field = (typeof FIELDS)[number];

export type Fields = Record<Field, string>;

export const EVAL_CATEGORY_LIST: Category[] = EVAL_CATEGORIES.map((name, index) => ({ id: `c${index}`, name, colorSlot: index }));

function options(text: string): string[] {
  return text.split("|").filter((option) => option !== "");
}

/** Which fields came out right. A title must hold an accepted word and no date or time words. */
export function grade(row: EvalRow, fields: Fields, today: IsoDate): Record<Field, boolean> {
  const [, title, kind, category, place] = row;

  return {
    title: options(title).some((word) => fields.title.includes(word)) && !hasDateOrTime(fields.title, today),
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

/** What the app shows: the model's answer after the rule guards, with these items already saved. */
export function guardedFields(input: string, extraction: Extraction | undefined, items: SavedItem[], today: IsoDate): Fields {
  if (extraction === undefined) {
    return ruleFields(input, today);
  }

  const card = cardFromParse(parseKorean(input, today), today, EVAL_CATEGORY_LIST);

  return fromExtraction(guardExtraction(extraction, input, card, EVAL_CATEGORY_LIST, items, today));
}

/** A used app, simulated: every other row of the set saved with its gold title words under its first gold category. */
export function otherRowsAsItems(rows: EvalRow[], row: EvalRow): SavedItem[] {
  return rows.flatMap((other) => {
    const category = EVAL_CATEGORY_LIST.find((c) => c.name === options(other[3])[0]);

    return other === row || category === undefined ? [] : [{ title: options(other[1]).join(" "), categoryId: category.id }];
  });
}
