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

  test("every N weeks", () => {
    expect(parseKorean("3주마다 금요일 보고", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "weekly", weekdays: [5], interval: 3, start: today },
    });
  });

  test("every N months on a day", () => {
    const expected = { kind: "recurring", rule: { freq: "monthly", day: 10, interval: 3, start: today } };

    expect(parseKorean("3개월마다 10일 정기점검", today).date).toEqual(expected);
    expect(parseKorean("3개월에 한 번 10일 정기점검", today).date).toEqual(expected);
  });

  test("every N months without a day uses today's day of month", () => {
    expect(parseKorean("2개월에 한 번 머리 자르기", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "monthly", day: 5, interval: 2, start: today },
    });
  });

  test("every N days", () => {
    expect(parseKorean("3일마다 화분 물주기", today).date).toEqual({
      kind: "recurring",
      rule: { freq: "daily", interval: 3, start: today },
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

// Cases found by running the korean-datetime (MIT) gold phrases through this parser.
describe("impossible dates and times are left as text", () => {
  test.each(["13월 1일 회의", "12월 99일 회의", "2월 30일 회의"])("%s", (text) => {
    const result = parseKorean(text, today);

    expect(result.date).toBeUndefined();
    expect(result.rest).toBe(text);
  });

  test("hour 25 is not a time", () => {
    expect(parseKorean("25시 회의", today).time).toBeUndefined();
  });

  test("a duration is not a clock time", () => {
    const result = parseKorean("1시간 운동", today);

    expect(result.time).toBeUndefined();
    expect(result.rest).toBe("1시간 운동");
  });

  test("Feb 29 goes to the next leap year", () => {
    expect(parseKorean("2월 29일 회의", today).date).toEqual({ kind: "single", date: "2028-02-29" });
  });
});

// Expressions the korean-datetime gold phrases showed missing. today = 2026-10-05 (Monday).
const dateOf = (text: string) => parseKorean(text, today).date;

const single = (date: string) => ({ kind: "single", date });

const span = (start: string, end: string) => ({ kind: "range", start, end });

const clockOf = (text: string) => {
  const time = parseKorean(text, today).time;

  return time?.kind === "exact" ? `${time.start.hour}:${String(time.start.minute).padStart(2, "0")}` : time?.kind;
};

describe("relative day words", () => {
  test.each([
    ["내일모레 출장", "2026-10-07"],
    ["그글피", "2026-10-09"],
    ["금일 마감", "2026-10-05"],
    ["명일 회의", "2026-10-06"],
    ["익일 배송", "2026-10-06"],
    ["내일까지 제출", "2026-10-06"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });

  test.each(["내일신문 구독", "오늘의집 가구", "내일정 확인해줘", "내일상 기록", "보고서 낼 것"])("%s is a word, not a day", (text) => {
    expect(dateOf(text)).toBeUndefined();
  });
});

describe("offsets from today", () => {
  test.each([
    ["3일 뒤 병원", "2026-10-08"],
    ["삼일 후", "2026-10-08"],
    ["이틀 후", "2026-10-07"],
    ["열흘 뒤", "2026-10-15"],
    ["보름 뒤", "2026-10-20"],
    ["하루 전", "2026-10-04"],
    ["일주일 후 재검사", "2026-10-12"],
    ["2주 뒤", "2026-10-19"],
    ["한 달 뒤", "2026-11-05"],
    ["3개월 후", "2027-01-05"],
    ["1년 후", "2027-10-05"],
    ["2주 3일 뒤", "2026-10-22"],
    ["오늘부터 일 년 뒤", "2027-10-05"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });

  test("a month later keeps to the end of a shorter month", () => {
    expect(parseKorean("한 달 뒤", "2027-01-31").date).toEqual(single("2027-02-28"));
  });

  test.each(["3일간 휴가", "30일 내로 반품", "7일 이내", "3일 연속 운동"])("%s is a duration", (text) => {
    expect(dateOf(text)).toBeUndefined();
  });
});

describe("days of the month", () => {
  test.each([
    ["15일 회의", "2026-10-15"],
    ["3일에 출발", "2026-11-03"],
    ["31일", "2026-10-31"],
    ["다음달 15일", "2026-11-15"],
    ["이번달 25일 월세", "2026-10-25"],
    ["다다음 달 3일", "2026-12-03"],
    ["말일까지 정산", "2026-10-31"],
    ["다음달 말일", "2026-11-30"],
    ["다음 달 첫날", "2026-11-01"],
    ["2월 말일", "2027-02-28"],
    ["다음 달 첫째 토요일", "2026-11-07"],
    ["다음 달 마지막 금요일", "2026-11-27"],
    ["이번 달 둘째 토요일", "2026-10-10"],
    ["다음달 첫째주 금요일", "2026-10-30"],
    ["삼월 오일", "2027-03-05"],
    ["시월 십오일", "2026-10-15"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });

  test.each(["1일 1식", "오일 교환하러 가"])("%s is not a date", (text) => {
    expect(dateOf(text)).toBeUndefined();
  });
});

describe("weeks", () => {
  test.each([
    ["이번 주말", "2026-10-10", "2026-10-11"],
    ["주말에 청소", "2026-10-10", "2026-10-11"],
    ["다음 주말", "2026-10-17", "2026-10-18"],
    ["다음주", "2026-10-12", "2026-10-18"],
    ["이번주 평일", "2026-10-05", "2026-10-09"],
    ["다음주초", "2026-10-12", "2026-10-13"],
  ])("%s", (text, start, end) => {
    expect(dateOf(text)).toEqual(span(start, end));
  });

  test.each([
    ["지난주 금요일", "2026-10-02"],
    ["차주 화요일", "2026-10-13"],
    ["목욜 회식", "2026-10-08"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });

  test("on a Sunday, 다음주 월요일 is tomorrow (weeks start on Monday)", () => {
    expect(parseKorean("다음주 월요일", "2026-10-11").date).toEqual(single("2026-10-12"));
  });
});

describe("clock words", () => {
  test.each([
    ["세시 반 회의", "15:30"],
    ["열한시 십오분", "11:15"],
    ["아홉시십오분", "9:15"],
    ["저녁 열시", "22:00"],
    ["열두시", "12:00"],
    ["정오", "12:00"],
    ["새벽 3시", "3:00"],
    ["밤 1시", "1:00"],
  ])("%s", (text, clock) => {
    expect(clockOf(text)).toBe(clock);
  });

  test("밤 12시 and 자정 are midnight, the start of the next day", () => {
    expect(parseKorean("오늘 밤 12시 마감", today)).toMatchObject({ date: single("2026-10-06"), time: { kind: "exact", start: { hour: 0, minute: 0 } } });
    expect(clockOf("자정")).toBe("0:00");
  });

  test("한시적 is not one o'clock", () => {
    expect(parseKorean("한시적으로 운영", today).time).toBeUndefined();
  });
});

describe("written dates, holidays and ranges", () => {
  test.each([
    ["2026-10-21", "2026-10-21"],
    ["2026.10.1", "2026-10-01"],
    ["2026/10/01 마감", "2026-10-01"],
    ["20261101", "2026-11-01"],
    ["25.07.15", "2025-07-15"],
    ["크리스마스 파티", "2026-12-25"],
    ["크리스마스 이브", "2026-12-24"],
    ["한글날", "2026-10-09"],
    ["개천절", "2027-10-03"],
    ["설날 귀성", "2027-02-07"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });

  test.each([
    ["내일부터 모레까지 출장", "2026-10-06", "2026-10-07"],
    ["10월 7일 ~ 10월 9일", "2026-10-07", "2026-10-09"],
    ["25일부터 3일까지", "2026-10-25", "2026-11-03"],
    ["추석 연휴", "2027-09-14", "2027-09-16"],
  ])("%s", (text, start, end) => {
    expect(dateOf(text)).toEqual(span(start, end));
  });
});
