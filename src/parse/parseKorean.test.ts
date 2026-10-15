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
    ["다음달 첫째주 금요일", "2026-11-06"],
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

describe("more gold-phrase gaps", () => {
  test.each([
    ["10월 9일 전까지 신청", "2026-10-09"],
    ["4 월 14 일", "2027-04-14"],
    ["4월달 14일", "2027-04-14"],
    ["올해 추석", "2026-09-25"],
    ["내년 크리스마스", "2027-12-25"],
    ["내년 2월 마지막 일요일", "2027-02-28"],
    ["지난 금요일", "2026-10-02"],
    ["크리스마스 전날", "2026-12-24"],
    ["다음 달 첫날 다음 날", "2026-11-02"],
    ["다음 달 마지막 금요일에서 이틀 뒤", "2026-11-29"],
    ["발렌타인데이", "2027-02-14"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });

  test.each([
    ["다음주 월요일부터 금요일까지 출장", "2026-10-12", "2026-10-16"],
    ["이번 주 금요일부터 일요일까지", "2026-10-09", "2026-10-11"],
    ["내일부터 3일 뒤까지", "2026-10-06", "2026-10-09"],
    ["10일부터 15일까지 휴가", "2026-10-10", "2026-10-15"],
  ])("%s", (text, start, end) => {
    expect(dateOf(text)).toEqual(span(start, end));
  });

  test("dates written without spaces before a time word", () => {
    expect(parseKorean("오늘저녁때 회식", today)).toMatchObject({ date: single("2026-10-05"), time: { kind: "slot", slot: "dinner" } });
    expect(parseKorean("내일아침 9시", today)).toMatchObject({ date: single("2026-10-06"), time: { kind: "exact", start: { hour: 9, minute: 0 } } });
  });

  test.each([
    ["PM 3:30", "15:30"],
    ["3pm 회의", "15:00"],
    ["3 시 회의", "15:00"],
    ["17시 5분 전", "16:55"],
    ["다섯시 십분전", "16:50"],
  ])("%s", (text, clock) => {
    expect(clockOf(text)).toBe(clock);
  });

  test("3~5시 is a range", () => {
    expect(parseKorean("3~5시 회의", today).time).toEqual({ kind: "exact", start: { hour: 15, minute: 0 }, end: { hour: 17, minute: 0 } });
  });

  test("a time range is not a date range", () => {
    expect(parseKorean("내일 3시부터 5시까지 회의", today)).toMatchObject({ date: single("2026-10-06"), time: { kind: "exact", start: { hour: 15, minute: 0 }, end: { hour: 17, minute: 0 } } });
  });
});

test("a bare day followed by a time keeps both", () => {
  expect(parseKorean("15일 3시 회의", today)).toMatchObject({ date: { kind: "single", date: "2026-10-15" }, time: { kind: "exact", start: { hour: 15, minute: 0 } } });
});

describe("third round of gold-phrase gaps", () => {
  test.each([
    ["월요일 회의", "2026-10-12"],
    ["다가오는 월요일", "2026-10-12"],
    ["다음 월요일", "2026-10-12"],
    ["오늘로부터 한 달 후", "2026-11-05"],
    ["25년 3월 1일", "2025-03-01"],
    ["99.03.01", "1999-03-01"],
    ["10/7(수) 14:00", "2026-10-07"],
    ["마지막 금요일", "2026-10-30"],
    ["내년 마지막 금요일", "2027-12-31"],
    ["올해 첫 월요일", "2026-01-05"],
    ["작년 마지막 날", "2025-12-31"],
    ["다음 해 첫날", "2027-01-01"],
    ["다다다음주 금요일", "2026-10-30"],
    ["다음 주 이맘때", "2026-10-12"],
    ["내년 이맘때", "2027-10-05"],
    ["저저번달 말일", "2026-08-31"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });
});

describe("date words left unread are flagged", () => {
  test.each(["그날 오전 9시 알림", "마지막 영업일 오후 3시", "다섯째 주 회의 준비", "2월 30일 회의"])("%s", (text) => {
    expect(parseKorean(text, today).flags).toContain("checkDate");
  });

  test.each(["내일 3시 회의", "주간 보고서 작성", "생일 선물 사기", "금요일까지 과제"])("%s", (text) => {
    expect(parseKorean(text, today).flags).not.toContain("checkDate");
  });
});

// Found by a review of ~420 everyday inputs against the expanded parser.
function noDate(text: string): string {
  const result = parseKorean(text, today);

  return result.date === undefined ? "none" : JSON.stringify(result.date);
}

describe("everyday inputs that must not get a wrong date", () => {
  test.each([
    "30일 챌린지 시작",
    "7일 무료체험 해지하기",
    "2박 3일 제주 여행",
    "회의 3일 전에 자료 공유",
    "7일 전 알림 설정",
    "이 일 후에 정리",
    "추석 선물 사기",
  ])("%s has no date", (text) => {
    expect(noDate(text)).toBe("none");
  });

  test.each(["아이폰 15 시리즈 출시", "1 시청 앞 집회", "D-3 시험", "3시청 앞"])("%s has no time", (text) => {
    expect(parseKorean(text, today).time).toBeUndefined();
  });

  test("3시회의 keeps its time", () => {
    expect(clockOf("3시회의")).toBe("15:00");
  });

  test.each([
    ["다음달 첫째주 금요일 회의", "2026-11-06"],
    ["12월 마지막 주 금요일 종무식", "2026-12-25"],
    ["다음주까지 견적서", "2026-10-18"],
    ["다음주부터 출근", "2026-10-12"],
    ["어제 주문한 택배 오늘 도착", "2026-10-05"],
    ["담주 월요일", "2026-10-12"],
    ["낼모레 회의", "2026-10-07"],
  ])("%s", (text, date) => {
    expect(dateOf(text)).toEqual(single(date));
  });

  test("이번주 토요일 said on a Sunday is the coming Saturday", () => {
    expect(parseKorean("이번주 토요일", "2026-10-11").date).toEqual(single("2026-10-17"));
  });

  test("N일부터 M일간 is a range", () => {
    expect(dateOf("10월 20일부터 3일간 워크샵")).toEqual(span("2026-10-20", "2026-10-22"));
  });

  test("월요일마다 repeats weekly", () => {
    expect(dateOf("월요일마다 분리수거")).toMatchObject({ kind: "recurring", rule: { freq: "weekly", weekdays: [1] } });
  });

  test.each(["매달 말일 정산", "매주 주말 등산"])("%s: a repeat word with an unreadable rule gets no single date, only a flag", (text) => {
    const result = parseKorean(text, today);

    expect(result.date).toBeUndefined();
    expect(result.flags).toContain("checkDate");
  });

  test.each(["1/2 진행상황 공유", "내일 회의 모레 발표"])("%s is flagged", (text) => {
    expect(parseKorean(text, today).flags).toContain("checkDate");
  });

  test.each([
    ["12월 25일 크리스마스 파티", "크리스마스 파티"],
    ["토요일엔 쉬기", "쉬기"],
    ["3시쯤 전화", "전화"],
    ["10월 25일 일요일 결혼식", "결혼식"],
    ["25일(일) 결혼식", "결혼식"],
    ["2박 3일 제주 여행", "2박 3일 제주 여행"],
  ])("%s keeps the title %s", (text, rest) => {
    expect(parseKorean(text, today).rest).toBe(rest);
  });

  test("오후 3:30 and 14:00~16:00", () => {
    expect(clockOf("오후 3:30 회의")).toBe("15:30");
    expect(parseKorean("14:00~16:00 회의", today).time).toEqual({ kind: "exact", start: { hour: 14, minute: 0 }, end: { hour: 16, minute: 0 } });
  });
});
