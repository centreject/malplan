import { describe, expect, test } from "vitest";
import {
  categoryClass,
  customColorCss,
  inkOn,
  setCustomColor,
  UNCATEGORIZED_ID,
  addCategory,
  deleteCategory,
  recolorCategory,
  renameCategory,
} from "./categories";
import type { Category, Item } from "./item";
import { ALL_TAB_ID, type CalendarTab } from "./tabs";

const work: Category = { id: "work", name: "회사", colorSlot: 1 };

const school: Category = { id: "school", name: "학교", colorSlot: 2 };

function item(id: string, categoryId: string): Item {
  return {
    id,
    title: id,
    kind: "event",
    categoryId,
    when: { kind: "none" },
    time: { kind: "anytime" },
    done: [],
  };
}

const tabs: CalendarTab[] = [
  { id: ALL_TAB_ID, name: "전체", categoryIds: undefined },
  { id: "t-school", name: "학교", categoryIds: ["school"] },
  { id: "t-both", name: "둘 다", categoryIds: ["work", "school"] },
];

describe("addCategory", () => {
  test("appends a new category on the least used colour slot", () => {
    const added = addCategory([work, school], "c1").at(-1);

    expect(added).toEqual({ id: "c1", name: "새 분류", colorSlot: 3 });
  });

  test("wraps around once every slot is taken", () => {
    const six = [1, 2, 3, 4, 5, 6].map((slot) => ({ id: `c${slot}`, name: "x", colorSlot: slot }));

    expect(addCategory(six, "c7").at(-1)?.colorSlot).toBe(1);
  });
});

describe("renameCategory", () => {
  test("renames with a trimmed name", () => {
    expect(renameCategory([work, school], "work", " 직장 ")[0]).toEqual({ ...work, name: "직장" });
  });

  test("an empty name keeps the old one", () => {
    expect(renameCategory([work], "work", "  ")[0]).toBe(work);
  });
});

describe("recolorCategory", () => {
  test("sets the slot", () => {
    expect(recolorCategory([work, school], "school", 5)[1]).toEqual({ ...school, colorSlot: 5 });
  });

  test("ignores slots outside 1..6", () => {
    expect(recolorCategory([work], "work", 0)[0]).toBe(work);
    expect(recolorCategory([work], "work", 7)[0]).toBe(work);
  });
});

describe("deleteCategory", () => {
  test("moves its items to 미분류, created on demand with slot 0", () => {
    const result = deleteCategory([work, school], tabs, [item("a", "work"), item("b", "school")], "work");

    expect(result.categories).toEqual([school, { id: UNCATEGORIZED_ID, name: "미분류", colorSlot: 0 }]);
    expect(result.items.map((i) => i.categoryId)).toEqual([UNCATEGORIZED_ID, "school"]);
  });

  test("removes the category from every tab, leaving 전체 alone", () => {
    const result = deleteCategory([work, school], tabs, [], "school");

    expect(result.tabs.map((t) => t.categoryIds)).toEqual([undefined, [], ["work"]]);
  });

  test("does not create 미분류 when no item moved", () => {
    expect(deleteCategory([work, school], tabs, [item("b", "school")], "work").categories).toEqual([school]);
  });

  test("reuses an existing 미분류", () => {
    const uncategorized: Category = { id: UNCATEGORIZED_ID, name: "미분류", colorSlot: 0 };
    const result = deleteCategory([work, uncategorized], tabs, [item("a", "work")], "work");

    expect(result.categories).toEqual([uncategorized]);
  });

  test("미분류 itself cannot be deleted", () => {
    const uncategorized: Category = { id: UNCATEGORIZED_ID, name: "미분류", colorSlot: 0 };
    const result = deleteCategory([uncategorized], tabs, [], UNCATEGORIZED_ID);

    expect(result.categories).toEqual([uncategorized]);
  });
});

describe("custom colours", () => {
  const base: Category[] = [{ id: "work", name: "회사", colorSlot: 1 }];

  test("a valid hex colour is stored normalised; a palette slot clears it", () => {
    const custom = setCustomColor(base, "work", "#AbCdEf");

    expect(custom[0]?.color).toBe("#abcdef");
    expect(recolorCategory(custom, "work", 2)[0]).toEqual({ id: "work", name: "회사", colorSlot: 2 });
  });

  test("invalid hex is ignored", () => {
    expect(setCustomColor(base, "work", "red")).toEqual(base);
    expect(setCustomColor(base, "work", "#12345")).toEqual(base);
  });

  test("ink on a colour: dark text on light colours, white on dark", () => {
    expect(inkOn("#ffd200")).toBe("#111111");
    expect(inkOn("#1b5fb5")).toBe("#ffffff");
    expect(inkOn("#ffffff")).toBe("#111111");
    expect(inkOn("#000000")).toBe("#ffffff");
  });

  test("css class: palette slot, or a per-category class for custom colours", () => {
    expect(categoryClass({ id: "work", name: "회사", colorSlot: 1 })).toBe("cat-1");
    expect(categoryClass({ id: "a-1", name: "x", colorSlot: 1, color: "#123456" })).toBe("catc-a-1");
    expect(categoryClass(undefined)).toBe("cat-0");
  });

  test("custom colour rules are generated only for safe ids and valid colours", () => {
    const css = customColorCss([
      { id: "a-1", name: "x", colorSlot: 1, color: "#123456" },
      { id: "bad}id", name: "y", colorSlot: 1, color: "#123456" },
    ]);

    expect(css).toBe(".catc-a-1{--c:#123456;--c-ink:#ffffff}");
  });
});
