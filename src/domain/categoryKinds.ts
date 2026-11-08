// Kinds of category users make, under the names they give them, with words that point to each.
// Rules use them to pick a category without AI; the AI prompt uses the same names for its examples.
import type { Category } from "./item";

export type CategoryKind = {
  /** What users call this kind of category; the first is the usual name. */
  names: string[];
  /** Words in a sentence that point to it. */
  words: string[];
};

/** In tie order: when two kinds match equally often, the earlier one wins ("요가 수업" is exercise). */
export const CATEGORY_KINDS = {
  exercise: {
    names: ["운동", "헬스", "건강"],
    words: ["헬스", "러닝", "조깅", "마라톤", "수영", "필라테스", "요가", "자전거", "라이딩", "등산", "클라이밍", "축구", "농구", "테니스", "배드민턴", "골프", "탁구", "볼링", "크로스핏", "스트레칭", "홈트", "피티"],
  },
  contest: {
    names: ["공모전", "대회", "대외활동"],
    words: ["해커톤", "경진", "출품", "포트폴리오", "서포터즈", "대외활동"],
  },
  school: {
    names: ["학교", "학업", "공부", "수업"],
    words: ["과제", "레포트", "리포트", "중간고사", "기말고사", "퀴즈", "수업", "강의", "교시", "교수", "조교", "논문", "졸업", "학기", "수강", "개강", "종강", "휴강", "동아리", "조별", "팀플", "장학금", "등록금", "학생회", "학과", "숙제", "학원"],
  },
  work: {
    names: ["회사", "직장", "업무"],
    words: ["회의", "미팅", "거래처", "고객사", "보고서", "출근", "출장", "야근", "회식", "결재", "견적", "회고", "사무실", "본사", "과장", "부장", "차장", "팀장", "대리님", "사장", "상무", "신입사원", "입사", "연봉", "계약서", "납품", "클라이언트", "프로젝트", "기획안", "워크숍"],
  },
  meet: {
    names: ["약속", "모임", "친구", "만남"],
    words: ["친구", "모임", "동창", "만남", "약속", "데이트", "소개팅", "결혼식", "돌잔치", "집들이", "브런치", "술자리", "파티"],
  },
  /** The broad one: chosen when nothing else fits. */
  personal: {
    names: ["개인", "생활", "일상"],
    words: [],
  },
} satisfies Record<string, CategoryKind>;

/** "민수랑", "지민이랑": someone to meet. */
const WITH_SOMEONE = /[가-힣]랑(?![가-힣])/g;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The name as a word of its own or a word's start: "학교 과제", "회사업무", but not "고등학교". */
export function namedIn(title: string, name: string): boolean {
  return name !== "" && new RegExp(`(?<![가-힣])${escapeRegExp(name)}`).test(title);
}

function categoryOf(kind: CategoryKind, categories: Category[]): Category | undefined {
  return categories.find((c) => kind.names.some((name) => c.name.includes(name)));
}

function hits(kind: CategoryKind, title: string): number {
  const extra = kind === CATEGORY_KINDS.meet ? (title.match(WITH_SOMEONE) ?? []).length : 0;

  return kind.words.filter((word) => title.includes(word)).length + extra;
}

/**
 * The rules' category, from the title alone: one named in it; else the user's category of the kind its words point to most;
 * else a broad one ("개인"); else the first.
 */
export function guessCategory(title: string, categories: Category[]): string {
  const named = categories.find((c) => namedIn(title, c.name));

  if (named !== undefined) {
    return named.id;
  }

  let best: { category: Category; hits: number } | undefined;

  for (const kind of Object.values(CATEGORY_KINDS)) {
    const category = categoryOf(kind, categories);
    const count = hits(kind, title);

    if (category !== undefined && count > (best?.hits ?? 0)) {
      best = { category, hits: count };
    }
  }

  return best?.category.id ?? categoryOf(CATEGORY_KINDS.personal, categories)?.id ?? categories[0]?.id ?? "";
}
