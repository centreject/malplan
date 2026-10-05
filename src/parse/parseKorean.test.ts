import { describe, expect, test } from "vitest";
import { parseKorean } from "./parseKorean";

// 2026-10-05 is a Monday.
const today = "2026-10-05";

describe("spec examples", () => {
  test("one-off dinner appointment", () => {
    const result = parseKorean("10월 31일에 김철수와 저녁약속 있음. 서울 어딘가에서 볼 듯? 메뉴는 안 정함", today);

    expect(result.date).toEqual({ kind: "single", date: "2026-10-31" });
    expect(result.time).toEqual({ kind: "slot", slot: "dinner" });
  });

  test("weekly until a date, with exact time", () => {
    const result = parseKorean("12월 28일까지 매주 수요일 오후 4시 회사 우편물 발송", today);

    expect(result.date).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", weekdays: [3], start: today, until: "2026-12-28" },
    });
    expect(result.time).toEqual({ kind: "exact", start: { hour: 16, minute: 0 } });
    expect(result.rest).toBe("회사 우편물 발송");
  });
});

describe("dates", () => {
  test("month/day already passed this year rolls to next year and says so", () => {
    const result = parseKorean("10월 31일 회의", "2026-11-10");

    expect(result.date).toEqual({ kind: "single", date: "2027-10-31" });
    expect(result.flags).toContain("rolledToNextYear");
  });

  test("relative days", () => {
    expect(parseKorean("오늘 장보기", today).date).toEqual({ kind: "single", date: "2026-10-05" });
    expect(parseKorean("내일 치과", today).date).toEqual({ kind: "single", date: "2026-10-06" });
    expect(parseKorean("모레 미팅", today).date).toEqual({ kind: "single", date: "2026-10-07" });
  });

  test("bare weekday means the nearest upcoming one", () => {
    expect(parseKorean("금요일 회의", today).date).toEqual({ kind: "single", date: "2026-10-09" });
  });

  test("next week's weekday", () => {
    expect(parseKorean("다음 주 수요일 발표", today).date).toEqual({
      kind: "single",
      date: "2026-10-14",
    });
  });

  test("date range", () => {
    expect(parseKorean("10월 10일부터 10월 12일까지 여행", today).date).toEqual({
      kind: "range",
      start: "2026-10-10",
      end: "2026-10-12",
    });
  });

  test("no date at all", () => {
    expect(parseKorean("보고서 쓰기", today).date).toBeUndefined();
  });
});

describe("recurrence", () => {
  test("every day", () => {
    expect(parseKorean("매일 아침 운동", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "daily", start: today },
    });
  });

  test("several weekdays", () => {
    expect(parseKorean("매주 월, 목 헬스", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", weekdays: [1, 4], start: today },
    });
  });

  test("every other week", () => {
    expect(parseKorean("격주 화요일 스터디", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", weekdays: [2], interval: 2, start: today },
    });
  });

  test("monthly on a day", () => {
    expect(parseKorean("매월 25일 월세", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "monthly", day: 25, start: today },
    });
  });

  test("monthly last Friday", () => {
    expect(parseKorean("매월 마지막 금요일 회식", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "monthly", nth: -1, weekday: 5, start: today },
    });
  });

  test("monthly 2nd Tuesday", () => {
    expect(parseKorean("매달 둘째 주 화요일 정기회의", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "monthly", nth: 2, weekday: 2, start: today },
    });
  });

  test("yearly", () => {
    expect(parseKorean("매년 3월 2일 개강", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "yearly", month: 3, day: 2, start: today },
    });
  });
});

describe("times", () => {
  test("half past", () => {
    expect(parseKorean("내일 오전 10시 반 치과", today).time).toEqual({
      kind: "exact",
      start: { hour: 10, minute: 30 },
    });
  });

  test("24-hour with minutes", () => {
    expect(parseKorean("16시 30분 미팅", today).time).toEqual({
      kind: "exact",
      start: { hour: 16, minute: 30 },
    });
  });

  test("evening hour is PM", () => {
    expect(parseKorean("모레 저녁 7시 약속", today).time).toEqual({
      kind: "exact",
      start: { hour: 19, minute: 0 },
    });
  });

  test("bare small hour is assumed PM and flagged", () => {
    const result = parseKorean("금요일 3시 회의", today);

    expect(result.time).toEqual({ kind: "exact", start: { hour: 15, minute: 0 } });
    expect(result.flags).toContain("assumedPm");
  });

  test("time range", () => {
    expect(parseKorean("오후 2시부터 4시까지 회의", today).time).toEqual({
      kind: "exact",
      start: { hour: 14, minute: 0 },
      end: { hour: 16, minute: 0 },
    });
    expect(parseKorean("14시~16시 회의", today).time).toEqual({
      kind: "exact",
      start: { hour: 14, minute: 0 },
      end: { hour: 16, minute: 0 },
    });
  });

  test("time-of-day slot", () => {
    expect(parseKorean("오늘 점심 약속", today).time).toEqual({ kind: "slot", slot: "lunch" });
    expect(parseKorean("밤에 빨래", today).time).toEqual({ kind: "slot", slot: "night" });
  });

  test("no time at all", () => {
    expect(parseKorean("내일 장보기", today).time).toBeUndefined();
  });
});
