// Korean number words → digits, only where they sit in a date or time phrase, so the
// date/time rules can stay digit-only. "오일 교환" (oil) and "한시적" stay untouched.

const SINO_DIGIT = new Map([["일", 1], ["이", 2], ["삼", 3], ["사", 4], ["오", 5], ["육", 6], ["칠", 7], ["팔", 8], ["구", 9]]);

const NATIVE = new Map([
  ["열두", 12], ["열한", 11], ["열", 10], ["아홉", 9], ["여덟", 8], ["일곱", 7],
  ["여섯", 6], ["다섯", 5], ["네", 4], ["세", 3], ["두", 2], ["한", 1],
]);

/** Day counts with their own words: 이틀 = 2 days. */
const DAY_COUNT = new Map([
  ["하루", 1], ["이틀", 2], ["사흘", 3], ["나흘", 4], ["닷새", 5], ["엿새", 6],
  ["이레", 7], ["여드레", 8], ["아흐레", 9], ["열흘", 10], ["보름", 15],
]);

const SINO = "(?:[이삼사오육칠팔구]?십[일이삼사오육칠팔구]?|[일이삼사오육칠팔구])";

const NATIVE_WORD = "(?:열두|열한|열|아홉|여덟|일곱|여섯|다섯|네|세|두|한)";

/** "이십구" → 29, "십" → 10, "삼" → 3. */
function sinoValue(text: string): number {
  const ten = text.indexOf("십");

  if (ten === -1) {
    return SINO_DIGIT.get(text) ?? 0;
  }

  const tens = ten === 0 ? 1 : SINO_DIGIT.get(text.slice(0, ten)) ?? 0;

  return tens * 10 + (SINO_DIGIT.get(text.slice(ten + 1)) ?? 0);
}

function countValue(text: string): number {
  return NATIVE.get(text) ?? sinoValue(text);
}

const AFTER_CLOCK = "(?=$|[\\s\\d,.~\\-]|반|에|부터|까지|쯤|정각|" + SINO + "\\s*분)";

const RULES: [RegExp, (match: string, ...groups: string[]) => string][] = [
  // 삼월 오일, 시월 십오일, 유월 3일: month words only when a day follows.
  [new RegExp(`(?<![가-힣])(${SINO}|유|시)월\\s*(?=(?:\\d{1,2}|${SINO})\\s*일)`, "g"), (_, month = "") => `${month === "유" ? 6 : month === "시" ? 10 : sinoValue(month)}월 `],
  [new RegExp(`(\\d월\\s*)(${SINO})(?=\\s*일)`, "g"), (_, head = "", day = "") => `${head}${sinoValue(day)}`],
  // 이십구일, 십오일: a bare day of the month with a tens digit ("삼일절", "오일" have none).
  [new RegExp(`(?<![가-힣\\d])([이삼]?십[일이삼사오육칠팔구]?)(?=일(?![가-힣]))`, "g"), (day) => (sinoValue(day) <= 31 ? String(sinoValue(day)) : day)],
  // 세시 반, 저녁 열시, 열한시 십오분.
  [new RegExp(`(?<![가-힣])(${NATIVE_WORD})\\s*시${AFTER_CLOCK}`, "g"), (_, hour = "") => `${NATIVE.get(hour) ?? 0}시`],
  [new RegExp(`(\\d시\\s*)(${SINO})\\s*분`, "g"), (_, head = "", minute = "") => `${head}${sinoValue(minute)}분`],
  // 이틀 후, 보름 뒤, 일주일 후, 삼일 후, 한 달 뒤, 일 년 뒤.
  // Not "하루 전날" ("the day before").
  [/(하루|이틀|사흘|나흘|닷새|엿새|이레|여드레|아흐레|열흘|보름)(?=\s*(?:뒤|후|전(?!날)|있다가))/g, (word) => `${DAY_COUNT.get(word) ?? 0}일`],
  [/일주일(?=\s*(?:뒤|후|전(?!날)|있다가))/g, () => "1주"],
  // Sino digits must touch the unit ("삼일 후"); "이 일 후에" is "after this job". "일 년" is the one spaced form.
  [
    new RegExp(`(?<![가-힣])(?:(${NATIVE_WORD})\\s*|(${SINO})|(일)\\s+(?=년))(년|개월|달|주|일)(?=\\s*(?:(?:\\d+|${NATIVE_WORD}|${SINO})\\s*(?:년|개월|달|주|일)\\s*)*(?:뒤|후|전|있다가))`, "g"),
    (_, native = "", sino = "", one = "", unit = "") => `${countValue(native || sino || one)}${unit}`,
  ],
];

export function normalizeNumbers(text: string): string {
  return RULES.reduce((current, [pattern, replace]) => current.replace(pattern, replace), text);
}
