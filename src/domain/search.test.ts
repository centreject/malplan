import { expect, test } from "vitest";
import type { Item } from "./item";
import { searchItems } from "./search";

const today = "2026-10-08";

function item(id: string, fields: Partial<Item>): Item {
  return {
    id,
    title: id,
    kind: "event",
    categoryId: "c",
    when: { kind: "single", date: today },
    time: { kind: "anytime" },
    done: [],
    ...fields,
  };
}

test("matches title, place and note, ignoring case and spaces at the ends", () => {
  const items = [
    item("팀 회의", {}),
    item("점심", { place: "강남역 회의실" }),
    item("Report", { note: "send to Kim" }),
    item("헬스", {}),
  ];

  expect(searchItems(items, " 회의 ", today).map((r) => r.item.id)).toEqual(["팀 회의", "점심"]);
  expect(searchItems(items, "KIM", today).map((r) => r.item.id)).toEqual(["Report"]);
});

test("empty query finds nothing", () => {
  expect(searchItems([item("a", {})], "  ", today)).toEqual([]);
});

test("each result carries the nearest upcoming date, else the last one; sorted by it", () => {
  const items = [
    item("past", { when: { kind: "single", date: "2026-09-01" } }),
    item("recent", { when: { kind: "single", date: "2026-10-01" } }),
    item("weekly", { when: { kind: "recurring", rule: { freq: "weekly", weekdays: [1], start: "2026-01-05" } } }),
    item("soon", { when: { kind: "single", date: "2026-10-09" } }),
    item("undated", { when: { kind: "none" } }),
  ];

  expect(searchItems(items, "", today, true).map((r) => [r.item.id, r.date])).toEqual([
    ["soon", "2026-10-09"],
    ["weekly", "2026-10-12"],
    ["recent", "2026-10-01"],
    ["past", "2026-09-01"],
    ["undated", undefined],
  ]);
});
