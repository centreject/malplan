import { describe, expect, test } from "vitest";
import { ALL_TAB_ID, addTab, deleteTab, moveTab, nextTabName, updateTab, type CalendarTab } from "./tabs";

const all: CalendarTab = { id: ALL_TAB_ID, name: "전체", categoryIds: undefined };

const school: CalendarTab = { id: "school", name: "학교", categoryIds: ["school"] };

const work: CalendarTab = { id: "work", name: "회사", categoryIds: ["work"] };

const ids = (tabs: CalendarTab[]) => tabs.map((t) => t.id);

describe("nextTabName", () => {
  test("counts 전체 as 1, so the first added tab is 탭 2", () => {
    expect(nextTabName([all])).toBe("탭 2");
  });

  test("takes the smallest number not already used by a tab name", () => {
    expect(nextTabName([all, { ...school, name: "탭 2" }, { ...work, name: "탭 4" }])).toBe("탭 3");
    expect(nextTabName([all, school, work])).toBe("탭 2");
  });
});

describe("addTab", () => {
  test("appends the tab with a trimmed name", () => {
    const tabs = addTab([all, school], "t1", "  운동 ", ["fitness"]);

    expect(tabs.at(-1)).toEqual({ id: "t1", name: "운동", categoryIds: ["fitness"] });
  });

  test("an empty name becomes the next 탭 N", () => {
    expect(addTab([all], "t1", " ", ["work"]).at(-1)?.name).toBe("탭 2");
  });
});

describe("updateTab", () => {
  test("renames and changes categories", () => {
    const tabs = updateTab([all, school, work], "school", "대학", ["school", "contest"]);

    expect(tabs[1]).toEqual({ id: "school", name: "대학", categoryIds: ["school", "contest"] });
    expect(tabs[2]).toBe(work);
  });

  test("an empty name keeps the old one", () => {
    expect(updateTab([all, school], "school", "", ["work"])[1]?.name).toBe("학교");
  });

  test("전체 cannot be changed", () => {
    expect(updateTab([all, school], ALL_TAB_ID, "모두", ["work"])[0]).toBe(all);
  });
});

describe("deleteTab", () => {
  test("removes the tab", () => {
    expect(ids(deleteTab([all, school, work], "school"))).toEqual([ALL_TAB_ID, "work"]);
  });

  test("전체 cannot be deleted", () => {
    expect(ids(deleteTab([all, school], ALL_TAB_ID))).toEqual([ALL_TAB_ID, "school"]);
  });
});

describe("moveTab", () => {
  const extra: CalendarTab = { id: "x", name: "x", categoryIds: ["x"] };

  test("moves a tab to the given index", () => {
    expect(ids(moveTab([all, school, work, extra], "x", 1))).toEqual([ALL_TAB_ID, "x", "school", "work"]);
    expect(ids(moveTab([all, school, work, extra], "school", 3))).toEqual([ALL_TAB_ID, "work", "x", "school"]);
  });

  test("전체 stays first", () => {
    expect(ids(moveTab([all, school, work], "work", 0))).toEqual([ALL_TAB_ID, "work", "school"]);
    expect(ids(moveTab([all, school, work], ALL_TAB_ID, 2))).toEqual([ALL_TAB_ID, "school", "work"]);
  });

  test("clamps past the end and ignores unknown ids", () => {
    expect(ids(moveTab([all, school, work], "school", 9))).toEqual([ALL_TAB_ID, "work", "school"]);
    expect(ids(moveTab([all, school], "nope", 1))).toEqual([ALL_TAB_ID, "school"]);
  });
});
