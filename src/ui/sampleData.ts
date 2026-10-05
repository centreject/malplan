// SYNTHETIC demo data for the first screen. Dates are relative to today so the
// views always look populated. Replace with real storage in a later step.
import { addDays, weekdayOf, type IsoDate } from "../domain/date";
import type { Category, Item } from "../domain/item";

export const SAMPLE_CATEGORIES: Category[] = [
  { id: "work", name: "회사", colorSlot: 1 },
  { id: "school", name: "학교", colorSlot: 2 },
  { id: "meet", name: "약속", colorSlot: 3 },
  { id: "contest", name: "공모전", colorSlot: 4 },
  { id: "personal", name: "개인", colorSlot: 5 },
  { id: "fitness", name: "운동", colorSlot: 6 },
];

/** Sample public holidays (real 2026–2027 dates); computed holidays come later. */
export const SAMPLE_HOLIDAYS = new Map<IsoDate, string>([
  ["2026-10-03", "개천절"],
  ["2026-10-05", "대체공휴일"],
  ["2026-10-09", "한글날"],
  ["2026-12-25", "성탄절"],
  ["2027-01-01", "신정"],
]);

export function sampleItems(today: IsoDate): Item[] {
  const day = (offset: number) => addDays(today, offset);
  const lastWednesday = addDays(today, -((weekdayOf(today) - 3 + 7) % 7) - 7);

  return [
    {
      id: "standup", title: "주간 회의", kind: "event", categoryId: "work",
      when: { kind: "single", date: day(0) },
      time: { kind: "exact", start: { hour: 9, minute: 30 }, end: { hour: 10, minute: 30 } },
      done: [], place: "3층 회의실",
    },
    {
      id: "lunch", title: "김철수와 점심", kind: "event", categoryId: "meet",
      when: { kind: "single", date: day(0) },
      time: { kind: "slot", slot: "lunch" }, done: [], place: "강남역 근처 (미정)",
    },
    {
      id: "review", title: "디자인 리뷰", kind: "event", categoryId: "work",
      when: { kind: "single", date: day(0) },
      time: { kind: "exact", start: { hour: 14, minute: 0 }, end: { hour: 15, minute: 0 } }, done: [],
    },
    {
      id: "mail", title: "회사 우편물 발송", kind: "task", categoryId: "work",
      when: { kind: "recurring", rule: { freq: "weekly", weekdays: [3], start: lastWednesday, until: day(84) } },
      time: { kind: "exact", start: { hour: 16, minute: 0 } }, done: [], place: "회사 근처 우체국",
    },
    {
      id: "return", title: "택배 반품 보내기", kind: "task", categoryId: "personal",
      when: { kind: "single", date: day(0) }, time: { kind: "anytime" }, done: [],
    },
    {
      id: "dentist", title: "치과 예약 전화", kind: "task", categoryId: "personal",
      when: { kind: "single", date: day(0) }, time: { kind: "undecided" }, done: [],
    },
    {
      id: "gym", title: "헬스", kind: "event", categoryId: "fitness",
      when: { kind: "recurring", rule: { freq: "weekly", weekdays: [1, 3, 5], start: day(-30) } },
      time: { kind: "exact", start: { hour: 19, minute: 30 } }, done: [],
    },
    {
      id: "db-class", title: "데이터베이스 수업", kind: "event", categoryId: "school",
      when: { kind: "recurring", rule: { freq: "weekly", weekdays: [2, 4], start: day(-40) } },
      time: { kind: "exact", start: { hour: 10, minute: 0 }, end: { hour: 11, minute: 30 } },
      done: [], place: "공학관 304호",
    },
    {
      id: "club", title: "동아리 모임", kind: "event", categoryId: "school",
      when: { kind: "single", date: day(2) }, time: { kind: "slot", slot: "dinner" }, done: [],
    },
    {
      id: "contest-1", title: "공모전 1차 서류 마감", kind: "task", categoryId: "contest",
      when: { kind: "single", date: day(3) }, time: { kind: "exact", start: { hour: 23, minute: 59 } }, done: [],
    },
    {
      id: "trip", title: "제주 여행", kind: "event", categoryId: "personal",
      when: { kind: "range", start: day(9), end: day(11) }, time: { kind: "anytime" }, done: [],
    },
    {
      id: "dinner", title: "김철수와 저녁", kind: "event", categoryId: "meet",
      when: { kind: "single", date: day(5) }, time: { kind: "slot", slot: "dinner" },
      done: [], place: "서울 어딘가 (미정)", note: "메뉴 미정",
    },
    {
      id: "report", title: "주간 보고서 제출", kind: "task", categoryId: "work",
      when: { kind: "single", date: day(-2) }, time: { kind: "exact", start: { hour: 18, minute: 0 } }, done: [],
    },
    {
      id: "dinner-team", title: "팀 회식", kind: "event", categoryId: "work",
      when: { kind: "recurring", rule: { freq: "monthly", nth: -1, weekday: 5, start: day(-60) } },
      time: { kind: "slot", slot: "dinner" }, done: [],
    },
    {
      id: "rent", title: "월세 이체", kind: "task", categoryId: "personal",
      when: { kind: "recurring", rule: { freq: "monthly", day: 25, start: day(-90) } },
      time: { kind: "anytime" }, done: [],
    },
    {
      id: "book", title: "도서관 책 반납", kind: "task", categoryId: "personal",
      when: { kind: "none" }, time: { kind: "anytime" }, done: [],
    },
    {
      id: "shoes", title: "운동화 사기", kind: "task", categoryId: "fitness",
      when: { kind: "none" }, time: { kind: "anytime" }, done: [],
    },
  ];
}
