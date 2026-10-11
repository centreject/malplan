import { describe, expect, test } from "vitest";
import type { Item } from "./item";
import type { Recurrence } from "./recurrence";
import { groupRecurring, taskSections } from "./lists";

// 2026-10-11 is a Sunday.
const today = "2026-10-11";

function item(id: string, fields: Partial<Item>): Item {
  return {
    id,
    title: id,
    kind: "task",
    categoryId: "c",
    when: { kind: "single", date: today },
    time: { kind: "anytime" },
    done: [],
    ...fields,
  };
}

const rec = (rule: Recurrence): Item["when"] => ({ kind: "recurring", rule });

const S = "2026-09-01";

describe("groupRecurring", () => {
  const items = [
    item("mail", { when: rec({ start: S, freq: "weekly", weekdays: [3] }) }),
    item("gym", { kind: "event", when: rec({ start: S, freq: "weekly", weekdays: [1, 3] }) }),
    item("rent", { when: rec({ start: S, freq: "monthly", day: 25 }) }),
    item("check", { when: rec({ start: S, freq: "monthly", day: 25, interval: 3 }) }),
    item("party", { when: rec({ start: S, freq: "monthly", nth: -1, weekday: 5 }) }),
    item("water", { when: rec({ start: S, freq: "daily", interval: 3 }) }),
    item("bday", { when: rec({ start: S, freq: "yearly", month: 3, day: 2 }) }),
    item("old", { when: rec({ start: S, freq: "weekly", weekdays: [2], until: "2026-10-01" }) }),
    item("once", {}),
  ];

  const groups = groupRecurring(items, today, 1);

  test("groups by the day things happen; a multi-day item appears in each day", () => {
    expect(groups.map((g) => [g.label, g.entries.map((e) => e.item.id)])).toEqual([
      ["매일·며칠마다", ["water"]],
      ["월요일", ["gym"]],
      ["수요일", ["mail", "gym"]],
      ["매월 25일", ["rent", "check"]],
      ["매월 마지막 금요일", ["party"]],
      ["매년 3/2", ["bday"]],
    ]);
  });

  test("each entry carries its own rule label and next date", () => {
    const monthly = groups.find((g) => g.label === "매월 25일");

    expect(monthly?.entries.map((e) => [e.rule, e.next])).toEqual([
      ["매월 25일", "2026-10-25"],
      // Every 3 months from September: 9/25, 12/25.
      ["3개월마다 25일", "2026-12-25"],
    ]);
  });

  test("finished series are listed separately", () => {
    expect(groupRecurring(items, today, 1, true).flatMap((g) => g.entries.map((e) => e.item.id))).toEqual(["old"]);
  });

  test("week start decides weekday order", () => {
    const sundayFirst = groupRecurring([item("sun", { when: rec({ start: S, freq: "weekly", weekdays: [0, 1] }) })], today, 0);

    expect(sundayFirst.map((g) => g.label)).toEqual(["일요일", "월요일"]);
  });
});

describe("taskSections", () => {
  test("overdue, today, upcoming, undated and done; events excluded", () => {
    const items = [
      item("late", { when: { kind: "single", date: "2026-10-09" } }),
      item("now", {}),
      item("soon", { when: { kind: "single", date: "2026-10-20" } }),
      item("weekly", { when: rec({ start: S, freq: "weekly", weekdays: [3] }), done: ["2026-10-07"] }),
      item("someday", { when: { kind: "none" } }),
      item("finished", { when: { kind: "single", date: "2026-10-01" }, done: ["2026-10-01"] }),
      item("meeting", { kind: "event" }),
    ];

    const sections = taskSections(items, today);

    // weekly's latest miss is 9/30 (10/7 was done), before late's 10/9.
    expect(sections.overdue.map((e) => e.item.id)).toEqual(["weekly", "late"]);
    expect(sections.today.map((e) => e.item.id)).toEqual(["now"]);
    expect(sections.upcoming.map((e) => [e.item.id, e.date])).toEqual([
      ["weekly", "2026-10-14"],
      ["soon", "2026-10-20"],
    ]);
    expect(sections.undated.map((e) => e.item.id)).toEqual(["someday"]);
    expect(sections.done.map((e) => e.item.id)).toEqual(["finished"]);
  });
});
