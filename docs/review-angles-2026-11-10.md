# 코드 리뷰: 6개 관점 (2026-11-10)

대상: main `2c15a4a`의 `src/`, `src-tauri/src/`. 코드는 수정하지 않았다.
동기화 저장소(`src/storage/`) 문제는 [review-sync-2026-11-10.md](review-sync-2026-11-10.md)에 따로 있고, 여기에는 다시 쓰지 않았다. 리뷰 A·C·D·E와 알려진 문제 10건(v0.2.4~HEAD에서 수정)도 뺐다.

판정
- **CONFIRMED**: 임시 테스트로 확인했거나(표에 "테스트"), 인용한 코드가 그 결과를 직접 만든다("코드").
- **PLAUSIBLE**: 코드로는 그렇게 읽히지만 실행해 보지 않았다.

방법: 서브에이전트 없이 직접 읽었다. 끝까지 읽은 곳은 `App.tsx`, `domain/`의 card·schedule·lists·reminders·reschedule·series·recurrence, `mcp/tools.ts`, `ui/`의 notifications·useNow·useBoard·ConfirmDialog 입력부, Rust 명령 목록이다. `parse/parseKorean.ts`(1,088줄), `llm/providers.ts`, `styles.css`는 패턴 검색만 했다.

## 1. 명세·불변식 (docs/SPEC.md 대비)

| # | 위치 | 문제 | 실패 시나리오 | 판정 | 고칠 방향 |
|---|---|---|---|---|---|
| S1 | `domain/reminders.ts:68`, `ui/notifications.ts:77` | "시간 미정 N건" 아침 알림은 08:00이 확인 구간에 들어와야 울린다. 앱을 켠 직후에는 직전 1분만 본다 | PC를 9시에 켜는 사용자는 이 알림을 한 번도 받지 못한다. 명세는 "그날 아침 1회" | CONFIRMED (테스트) | 08:00이 지났고 오늘 키(`undecided@날짜`)를 아직 안 보냈으면 울린다. 중복은 기존 키가 막는다 |
| S2 | `domain/schedule.ts:53`, `domain/card.ts:190` | 완료 표시를 종류와 무관하게 계산하고, 편집 저장이 `done`을 그대로 옮긴다 | 완료한 할 일을 "일정"으로 바꾸면 취소선이 남고 체크 버튼은 없어서 풀 수 없다. 명세는 "일정: 완료 체크 없음" | CONFIRMED (테스트) | `occurrencesOn`에서 할 일만 완료로 본다 |
| S3 | `domain/lists.ts:107`, `ui/ListPage.tsx:58` | 목록의 "완료한 할 일"에 있는 끝난 반복 할 일은 종료일(`until`)을 키로 체크를 바꾼다. 종료일은 회차 날짜가 아닐 수 있다 | "10/12까지 매주 수요일"(회차는 10/7)에서 "완료 취소"를 누르면 10/12에 완료 표시가 **추가**되고 화면은 그대로다 | CONFIRMED (테스트) | 완료 구역의 날짜를 마지막 회차 날짜로 낸다 |
| S4 | `domain/card.ts:318` | 끝 시각이 시작보다 이르면 저장을 막는다 | "밤 10시~새벽 1시"를 입력할 수 없다. .ics 내보내기는 이 경우를 다음 날로 처리하도록 되어 있어 서로 어긋난다 | CONFIRMED (코드) | 허용하고 다음 날로 본다. 또는 내보내기의 그 분기를 지운다 |
| S5 | 문서 | 명세와 구현이 달라진 곳 (코드 문제는 아님) | 수정 학습 "최근 10~20개" → 실제는 100개 저장, 최대 8개 사용(`llm/corrections.ts:8`, `llm/extract.ts:63-65`). "PC 사양에 따라 모델 자동 선택", "모델 경로 직접 지정" → 없음. "옮기기/덮어쓰기/합치기" → 합치기와 "그 폴더만" 둘뿐. "반영된 로그 삭제" → 7일 뒤 정리. 모델 "약 2GB, 2.4~3B급" → 2.5GB, 4B | CONFIRMED (코드) | SPEC.md를 현재 구현에 맞춘다 |

## 2. 근본 원인 (같은 원인이 여러 곳에)

| # | 위치 | 문제 | 실패 시나리오 | 판정 | 고칠 방향 |
|---|---|---|---|---|---|
| R1 | `domain/card.ts:182-205`, `:352`, `App.tsx:339-350` | 편집 저장이 "창을 열 때의 값"으로 항목 전체를 바꾼다. 안 고친 필드도 다시 쓴다 | 편집 창을 열어 둔 사이 다른 기기가 제목을 고치거나 완료 체크를 했다. 이 기기에서 장소만 고쳐 확인하면 제목이 되돌아가고 체크가 풀린다 | CONFIRMED (테스트) | 열 때의 카드와 저장할 때의 카드를 비교해 바뀐 필드만 현재 항목에 적용한다 |
| R2 | `domain/schedule.ts:38`, `mcp/tools.ts:130`, `domain/lists.ts:90,124,126`, `domain/schedule.ts:104`, `ui/ListPage.tsx:58` | "완료 키"를 정하는 규칙이 다섯 군데에 따로 있다. A3(기간 할 일)과 S3이 이 원인에서 나왔다 | 한 곳의 규칙만 바꾸면 화면마다 완료 여부가 달라진다 | CONFIRMED (코드) | `doneKey`와 `isDone(item, date)` 하나로 모은다 |
| R3 | `ui/ConfirmDialog.tsx:304-312`, `:334-341` | 날짜·시각 칸을 고치는 도중의 빈 값("")을 "값 없음"으로 저장한다. A5(종료일)는 고쳤지만 기간 끝 날짜와 끝 시각은 그대로다 | 기간의 끝 날짜를 고치려고 일부를 지운 순간 확인하면 하루 일정으로 저장된다 | PLAUSIBLE | 값을 지우는 것은 버튼으로만 하고, 빈 값은 무시한다 |
| R4 | `src-tauri/src/model_download.rs:18-20`, `llm_server.rs:12`, `llm/localModel.ts:7`, `ui/AiSettings.tsx:88,130`, `ui/FirstRunNotice.tsx:57`, `ui/AboutSettings.tsx:8` | 모델 하나의 정보(파일, 주소, 크기, 해시, 이름, 라이선스, "2.5GB" 문구)가 Rust와 TS 여섯 곳에 흩어져 있다 | 계획된 모델 교체(Qwen3.5, Gemma) 때 한 곳을 빠뜨리면 이름·크기 안내가 실제와 달라진다 | CONFIRMED (코드) | 모델 정보를 한 곳(Rust 상수 → `model_status` 응답)에 두고 화면은 그 값을 쓴다 |

## 3. 중복

| # | 위치 | 문제 | 실패 시나리오 | 판정 | 고칠 방향 |
|---|---|---|---|---|---|
| D1 | `ui/ItemDetail.tsx:50`, `ui/ConfirmDialog.tsx:54`, `ui/NotificationSettings.tsx:9`, `domain/reminders.ts:79` | 알림 시간 문구와 선택지가 네 곳에 따로 있다 | 같은 값을 편집 창은 "1시간 전", 상세 창은 "60분 전"(하루 전은 "1440분 전")으로 보여 준다. 기본 알림은 5·15분을 고를 수 있고 항목별 알림은 못 고른다 | CONFIRMED (코드) | 문구 함수 하나와 선택지 목록 하나 |
| D2 | `domain/card.ts:341`, `domain/categories.ts:9-14` | 새 분류의 색을 고르는 규칙이 둘이다 | 편집 창에서 만든 분류는 "개수 % 6", 다른 곳에서 만든 분류는 "가장 덜 쓴 색"이라 색이 겹친다 | CONFIRMED (코드) | `commitCards`가 `addNamedCategory`를 쓴다 |
| D3 | `ui/useNow.ts:16-24`, `mcp/main.ts:77-81` | 오늘 날짜 문자열을 만드는 코드가 둘이다 | 한쪽만 고치면 앱과 MCP의 "오늘"이 달라진다 | CONFIRMED (코드) | `domain/date.ts`에 `localDate(date)` 하나 |
| D4 | `ui/StorageSettings.tsx`, `AiSettings.tsx`, `WindowSettings.tsx`, `BackupSettings.tsx`, `useBoard.ts`, `specialDays.ts`, `llm/providers.ts` | `error instanceof Error ? error.message : String(error)`가 7번 | 없음 (유지보수) | CONFIRMED (코드) | `errorText(error)` 하나. `connectionErrorText`와 합칠 수 있다 |
| D5 | `ConfirmDialog`, `TabEditor`, `SettingsDialog`, `SearchDialog`, `ItemDetail`, `FirstRunNotice`, `UpdateNotice` | 대화상자를 여는 effect(`showModal`)와 취소 처리가 7번 반복 | 없음 (유지보수) | CONFIRMED (코드) | `useModal(ref, open)` 하나 |
| D6 | `ui/TodayPane.tsx:52-60`, `ui/ListPage.tsx:53-61` | 완료 체크 버튼 마크업이 둘 | 없음 | CONFIRMED (코드) | `parts.tsx`에 `CheckButton` |
| D7 | `storage/board.ts:40`, `mcp/main.ts:83`, `domain/holidays.ts:164` | 날짜 형식 검사가 셋(정규식, `isRealDate`, `v.isoDate`) | 동기화 파일은 2026-02-31을 통과시키고 MCP는 막는다 | CONFIRMED (코드) | `isRealDate` 스키마 하나를 공유. 단, 저장된 옛 데이터가 걸러지지 않는지 먼저 확인 |

## 4. 단순화 (지울 수 있는 것)

| # | 위치 | 문제 | 판정 | 고칠 방향 |
|---|---|---|---|---|
| P1 | `src-tauri/src/llm_server.rs:143-146`, `lib.rs:90` | Rust 명령 `llm_running`을 부르는 곳이 없다 | CONFIRMED (검색) | 삭제 |
| P2 | `storage/compact.ts:6,41-45,66` | `keptChanges`를 만들지만 K4 수정 뒤로 읽는 곳이 없다 | CONFIRMED (검색) | 반환값을 스냅샷만으로 |
| P3 | `domain/card.ts:74` | `guessCategory`를 `card.ts`가 다시 내보낸다 | CONFIRMED (코드) | 쓰는 곳에서 직접 import |
| P4 | `styles.css` | 안 쓰는 클래스를 찾았지만 없었다(240개 모두 사용) | 문제없음 | |

## 5. 효율

측정: 임시 벤치(vitest, 이 PC). 항목 구성은 반복 1/3, 기간 1/3, 하루 1/3이고, 반복 할 일은 2025-01부터 전부 미완료인 최악의 경우다.

| # | 위치 | 문제 | 측정·시나리오 | 판정 | 고칠 방향 |
|---|---|---|---|---|---|
| E1 | `domain/schedule.ts:99-116` (`missedDates`), `App.tsx:409` | 밀린 할 일 계산이 반복 할 일마다 시작일부터 어제까지 하루씩 걷는다. 항목이 하나라도 바뀌면 전부 다시 계산한다 | 200개: 177ms, 1,000개: 840ms. 체크 한 번, 편집 한 번마다 든다 | CONFIRMED (측정) | 항목 객체를 키로 결과를 기억한다(`WeakMap`). 항목은 불변이라 안 바뀐 항목은 다시 계산하지 않는다 |
| E2 | `ui/ListPage.tsx:46` | 목록 화면이 `taskSections`(안에서 `missedDates`)를 렌더마다 다시 계산한다 | 목록을 연 채 입력창에 글자를 칠 때마다 E1의 비용이 든다 | CONFIRMED (코드) | `useMemo`. E1을 고치면 대부분 해결 |
| E3 | `App.tsx:154`, `ui/TopBar.tsx` | 입력창 글자가 App 상태라서 글자마다 오늘·주·달 창이 전부 다시 계산된다 | 창 계산만 200개: 13ms, 1,000개: 63ms(글자당). React 렌더 시간은 별도 | CONFIRMED (측정) | 입력 글자를 `TopBar` 안에 두고 제출할 때만 올린다 |
| E4 | `ui/useBoard.ts:79-120` | 1분마다, 그리고 창에 포커스가 올 때마다 모든 동기화 파일을 다시 읽고 검증한다 | 스냅샷이 커질수록 늘어난다. 측정하지 않았다 | PLAUSIBLE | 파일 크기·수정 시각이 같으면 건너뛴다 |

## 6. CLAUDE.md 규칙

| 규칙 | 결과 |
|---|---|
| 타입 단언에는 `// SAFETY:` | 위반 없음. 단언 2개(`storage/board.ts:118`, `ui/OverdueList.tsx:58`) 모두 주석 있음 |
| 로직 안에서 시계를 읽지 않는다 | 위반 없음. `new Date()`와 `Date.now`는 경계(`useNow`, `mcp/main.ts`, `BackupSettings`, `useBoard`의 주입)에만 있음 |
| 외부 경계는 valibot으로 검증 | LLM 응답, 동기화 파일, 공휴일 API, MCP 입력, localStorage 모두 검증. Rust 명령의 응답은 `invoke<T>`의 타입 인자만 있고 검증은 없음(`storage/backends.ts:14-26`). 자기 코드라 낮음 |
| 테스트는 모듈 mock 없이 | 위반 없음. `vi.mock` 없음, `vi.stubGlobal("window")` 1곳(`llm/providers.server.test.ts:38`) |
| lint 규칙을 끄지 않는다 | 위반 없음. disable 주석 없음 |
| Rust는 얇게 | `model_download.rs`(369줄)에 이어받기·재시도·해시 검증 로직이 있다. 2.5GB를 디스크로 바로 받아야 해서 Rust에 둔 것으로 보이나, 규칙의 "플러그인과 프로세스 연결만"보다는 넓다. 판단 필요 |
| 날짜·반복은 코드가 계산 | 위반 없음 |
| `ui/`에 테스트 | 규칙은 아니지만, 로직이 있는 훅(`useBoard`, `useReminders`, `useNow`)에 테스트가 없다 |

## 먼저 고칠 5개

| 순위 | 항목 | 이유 |
|---|---|---|
| 1 | **R1** 편집 저장이 항목 전체를 덮어씀 | 두 기기를 쓰면 다른 기기의 편집과 완료 체크가 조용히 되돌아간다. 동기화의 "필드 단위 병합"을 편집 창이 무효로 만든다 |
| 2 | **E1 + E2** 밀린 할 일 계산 | 측정된 지연이고, 반복 할 일이 쌓일수록 체크 한 번이 느려진다. 수정은 몇 줄 |
| 3 | **S1** 아침 "시간 미정" 알림 | 명세의 기능이 PC를 8시 이후에 켜는 사용자에게는 동작하지 않는다 |
| 4 | **S3 + R2** 완료 키 | 목록 화면의 버튼 하나가 동작하지 않고, 같은 원인의 버그가 이미 두 번 나왔다 |
| 5 | **S2** 일정에 남는 완료 표시 | 풀 방법이 없는 취소선. 한 줄 수정 |

모델을 바꾸기 전에는 **R4**(모델 정보 한 곳으로)를 먼저 하는 것이 좋다.
