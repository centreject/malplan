import { describe, expect, test } from "vitest";
import { toIcs } from "./ics";
import { parseIcs } from "./icsImport";
import type { Item } from "./item";

function item(id: string, fields: Partial<Item>): Item {
  return { id, title: id, kind: "event", categoryId: "c", when: { kind: "single", date: "2026-11-18" }, time: { kind: "anytime" }, done: [], ...fields };
}

describe("parseIcs", () => {
  test("malplan's own export comes back as the same items", () => {
    const items: Item[] = [
      item("meeting", { time: { kind: "exact", start: { hour: 15, minute: 0 }, end: { hour: 16, minute: 30 } }, place: "3층, 회의실", note: "자료\n준비" }),
      item("trip", { when: { kind: "range", start: "2026-11-20", end: "2026-11-22" } }),
      item("night", { time: { kind: "exact", start: { hour: 22, minute: 0 }, end: { hour: 1, minute: 0 } } }),
      item("swim", {
        when: { kind: "recurring", rule: { freq: "weekly", weekdays: [2, 4], start: "2026-11-03", until: "2026-12-31", except: ["2026-11-19"] } },
        time: { kind: "exact", start: { hour: 19, minute: 0 } },
      }),
      item("rent", { kind: "task", when: { kind: "recurring", rule: { freq: "monthly", nth: -1, weekday: 5, start: "2026-11-27" } } }),
      item("someday", { kind: "task", when: { kind: "none" }, done: ["done"] }),
    ];

    const back = parseIcs(toIcs(items, "20261118T000000Z"), "Asia/Seoul", "c");

    expect(back.warnings).toEqual([]);
    expect(back.items.map(({ id, title, kind, categoryId, when, time, place, note, done }) => ({ id, title, kind, categoryId, when, time, place, note, done }))).toEqual([
      { ...items[0], done: [] },
      { ...items[1], place: undefined, note: undefined },
      { ...items[2], place: undefined, note: undefined },
      // DTSTART is the first occurrence, so the rule starts there.
      // No end time is exported as one hour, which comes back as the end.
      { ...items[3], time: { kind: "exact", start: { hour: 19, minute: 0 }, end: { hour: 20, minute: 0 } }, place: undefined, note: undefined },
      { ...items[4], place: undefined, note: undefined },
      { ...items[5], place: undefined, note: undefined },
    ]);
  });

  test("another calendar's file: zones, all-day, COUNT, folded lines, overrides and alarms", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Seoul",
      "END:VTIMEZONE",
      "BEGIN:VEVENT",
      "UID:a1@google.com",
      "DTSTART;TZID=Asia/Seoul:20261118T093000",
      "DTEND;TZID=Asia/Seoul:20261118T103000",
      "SUMMARY:주간 회의\\, 팀 전체",
      "DESCRIPTION:긴 메모가 여러 줄에 걸쳐 접혀 ",
      " 있습니다",
      "RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3",
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "END:VALARM",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:a1@google.com",
      "RECURRENCE-ID;TZID=Asia/Seoul:20261125T093000",
      "DTSTART;TZID=Asia/Seoul:20261125T110000",
      "SUMMARY:주간 회의 (옮김)",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:b2@google.com",
      "DTSTART:20261119T060000Z",
      "DTEND:20261119T070000Z",
      "SUMMARY:UTC로 적힌 약속",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:c3@google.com",
      "DTSTART;VALUE=DATE:20261224",
      "DTEND;VALUE=DATE:20261225",
      "SUMMARY:크리스마스 이브",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:d4",
      "DTSTART:20261201T090000",
      "RRULE:FREQ=MONTHLY;BYDAY=1MO,3MO",
      "SUMMARY:못 읽는 반복",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:e5",
      "STATUS:CANCELLED",
      "DTSTART:20261201T090000",
      "SUMMARY:취소됨",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const { items, warnings } = parseIcs(text, "Asia/Seoul", "imported");

    expect(items.map((i) => [i.id, i.title, i.when, i.time])).toEqual([
      [
        "ics-a1@google.com",
        "주간 회의, 팀 전체",
        { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: "2026-11-18", until: "2026-12-02" } },
        { kind: "exact", start: { hour: 9, minute: 30 }, end: { hour: 10, minute: 30 } },
      ],
      ["ics-b2@google.com", "UTC로 적힌 약속", { kind: "single", date: "2026-11-19" }, { kind: "exact", start: { hour: 15, minute: 0 }, end: { hour: 16, minute: 0 } }],
      ["ics-c3@google.com", "크리스마스 이브", { kind: "single", date: "2026-12-24" }, { kind: "anytime" }],
      ["ics-d4", "못 읽는 반복", { kind: "single", date: "2026-12-01" }, { kind: "exact", start: { hour: 9, minute: 0 } }],
    ]);
    expect(items[0]?.note).toBe("긴 메모가 여러 줄에 걸쳐 접혀 있습니다");
    expect(items.every((i) => i.categoryId === "imported")).toBe(true);
    expect(warnings).toEqual(["못 읽는 반복: 반복 규칙을 읽지 못해 첫 날만 가져왔습니다.", "반복 일정에서 따로 고친 회차 1개는 가져오지 않았습니다(반복 규칙대로 들어갑니다)."]);
  });

  test("a time in a zone the platform does not know stays as written; a file with no dates gives nothing", () => {
    const outlook = "BEGIN:VEVENT\nUID:x\nDTSTART;TZID=Korea Standard Time:20261118T140000\nSUMMARY:아웃룩\nEND:VEVENT";

    expect(parseIcs(outlook, "Asia/Seoul", "c").items[0]?.time).toEqual({ kind: "exact", start: { hour: 14, minute: 0 } });
    expect(parseIcs("not a calendar", "Asia/Seoul", "c")).toEqual({ items: [], warnings: [] });
  });
});
