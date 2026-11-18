// What the confirm screen says when the AI could not tidy every sentence. Kept apart from the screen so it is tested.
import type { LocalStatus } from "./localServer";
import { connectionErrorText } from "./providers";

/** Thrown for a sentence whose AI reply is not the JSON asked for. */
export const UNREADABLE_REPLY = "unreadable reply";

/**
 * The note for one request's per-sentence results, or undefined when every sentence came through. When only some
 * failed it says how many, instead of calling the whole request a failure. `localStatus`: the local server's, when
 * the local model was asked.
 */
export function aiFailureNote(results: readonly PromiseSettledResult<unknown>[], provider: string, localStatus: LocalStatus | undefined): string | undefined {
  const failures = results.flatMap((result) => (result.status === "rejected" ? [result.reason instanceof Error ? result.reason : String(result.reason)] : []));
  const first = failures[0];

  if (first === undefined) {
    return undefined;
  }

  const why = first instanceof Error && first.message === UNREADABLE_REPLY
    ? "AI 답을 읽지 못해 규칙 기반으로만 정리했습니다."
    : provider !== "local"
    ? `AI 정리 실패: ${connectionErrorText(first)} 규칙 기반 결과를 확인하세요.`
    : localStatus === "no-model"
      ? "로컬 AI 모델이 없어 규칙 기반으로만 정리했습니다. 마이페이지 → AI 변환에서 받을 수 있습니다."
      : "로컬 AI 모델이 아직 준비되지 않아 규칙 기반으로만 정리했습니다.";

  return failures.length < results.length ? `${results.length}개 중 ${failures.length}개만 해당 · ${why}` : why;
}
