# malplan

[English](README.md) | **한국어**

일정을 한국어 한 문장으로 입력하고, 채워진 카드를 확인한 뒤, 오늘·이번 주·이번 달에서 한 번에 보는 앱입니다.

> 12월 28일까지 매주 수요일 오후 4시 회사 우편물 발송
>
> → 매주 수요일 16시, 12/28까지 · 분류 회사 · 할 일

malplan은 일정과 할 일을 함께 관리하는 Windows 데스크톱 앱입니다. 날짜와 시간은 코드가 읽고 AI가 추측하지 않습니다. 내 PC에서 도는 작은 AI 모델은 제목·분류·장소만 정리합니다. 확인을 누르기 전에는 아무것도 저장되지 않습니다.

**상태: v0.1.0 (베타).** Windows 10/11 x64. 코드 서명된 설치 파일과 자동 업데이트는 아직 없습니다.

## 기능

- **한 문장으로 카드 만들기**: 날짜·시간·기간·반복("매주 월·목", "매월 마지막 금요일", "격주", "3개월마다")은 규칙으로 읽고, 확인 화면은 추측한 값마다 "추정"을 표시합니다.
- **한 화면에 오늘 / 주간 / 월간**: 분류별 달력 탭, 제목을 눌러 연·월·주 선택, 완료할 때까지 남는 밀린 할 일 목록.
- **말로 고치기**: 저장한 항목을 "3시로 바꿔", "하루 미뤄", "장소는 강남역으로"처럼 말로 고칩니다.
- **로컬 AI, API 키는 선택**: Qwen3 4B를 llama.cpp로 내 PC에서 실행합니다(2.5GB 한 번 받으면 이후 인터넷 없이 동작). Claude, Gemini, OpenRouter 키를 대신 쓸 수도 있습니다.
- **직접 고른 폴더로 동기화**(로컬, NAS, 클라우드 동기화 폴더): 기기마다 자기 기록 파일에만 쓰고, 변경은 필드 단위로 합칩니다.
- **AI 도구 연결(MCP)**: Claude Code, Claude Desktop, Gemini CLI, Antigravity, Codex에서 일정을 보고, 찾고, 추가할 수 있습니다.
- 공휴일(음력 포함), 알림, 검색, ICS 내보내기, 백업, 트레이, 자동 실행, 직접 정하는 전역 단축키.
- 디자인 4종(버스 안내판, 탁상달력, 기본, 고대비), 각각 밝게·어둡게, 글자 크기 3단계.

## 동작 방식

| 부분 | 정하는 쪽 |
|---|---|
| 날짜, 시간, 반복 | 규칙 기반 한국어 파서([`src/parse`](src/parse)). 공개 시험 문장 1,182건 기준 일정 표현 86.7% 정답 |
| 제목, 종류, 분류, 장소 | 로컬 모델(또는 API)을 규칙으로 한 번 더 검사. 튜닝에 쓰지 않은 90문장 기준 약 90% 정답 |
| 저장 | 사용자가 확인 화면에서 |

모델은 입력창을 누를 때 켜지고 10분 동안 쓰지 않으면 꺼집니다. API를 고르지 않는 한 입력한 내용은 PC 밖으로 나가지 않습니다.

## 설치

아직 배포용 빌드는 없습니다. 소스에서 실행하려면:

```bash
npm ci
npm run fetch:llama   # llama-server CPU 빌드 (버전 고정, SHA256 확인)
npm run tauri dev
```

처음 실행하면 AI 모델(2.5GB, Apache 2.0)을 `%LOCALAPPDATA%\com.centreject.malplan\models`에 받을지 묻습니다. 받지 않아도 날짜·시간은 규칙으로 읽습니다.

설치 파일(NSIS, 사용자 단위 설치, 관리자 권한 불필요) 만들기: `npx tauri build`

**필요 사양**: Windows 10/11 x64, WebView2(Windows 11에 기본 포함), 모델용 여유 공간 약 3GB, RAM 8GB 권장.

## AI 도구에서 쓰기 (MCP)

설치 폴더의 `mcp/malplan-mcp.mjs`가 MCP 서버입니다(Node.js 필요). 마이페이지 → AI 도구 연결에서 내 PC 경로가 채워진 명령과 설정을 복사할 수 있습니다. Claude Code 예:

```bash
claude mcp add malplan -- node "<설치 폴더>\mcp\malplan-mcp.mjs" --dir "<동기화 폴더>"
```

도구: `list_schedule`, `find_schedule`, `preview_schedule`, `add_schedule`, `complete_task`. 날짜는 항상 malplan의 파서가 계산하고, 추가는 미리보기를 거칩니다.

## 개발

| 명령 | 하는 일 |
|---|---|
| `npm run check` | oxlint(내장 anti-slop 규칙 포함), TypeScript, Vitest |
| `npm run build` | 화면 빌드 |
| `npm run build:mcp` | MCP 서버 묶음(`dist-mcp/`) |
| `npm run bench:parse` | 공개 시험 문장으로 파서 채점 |
| `npm run bench:llm` | AI 정리 채점(llama-server 실행 필요) |

로직은 TypeScript(`src/`)에 있고, Rust(`src-tauri/`)는 플러그인과 프로세스 관리만 합니다. 모델 응답, 동기화 파일, MCP 호출 같은 외부 입력은 모두 valibot으로 검사합니다.

```
src/
  domain/   항목, 반복, 일정, 고치기 (순수 함수, 테스트)
  parse/    한국어 날짜·시간 파서와 시험 문장
  llm/      지시문, 제공자, 로컬 서버 제어
  storage/  동기화 폴더: 기기별 기록, 필드 단위 병합
  mcp/      MCP 서버 (tools.ts는 순수 로직, main.ts는 Node 연결부)
  ui/       React 컴포넌트
src-tauri/  Tauri: 트레이, 단축키, llama-server 프로세스, 모델 다운로드
docs/       명세, 계획, 제품·디자인 문서
```

## 문서

- [docs/SPEC.md](docs/SPEC.md): 확정 명세
- [docs/PLAN.md](docs/PLAN.md): 계획, 측정값, 진행 기록
- [docs/DESIGN.md](docs/DESIGN.md): 디자인 시스템

## 라이선스

malplan은 [MIT 라이선스](LICENSE)로 배포합니다. 포함되거나 내려받는 구성 요소는 각자의 라이선스를 따릅니다: llama.cpp (MIT), Qwen3 4B (Apache 2.0), Tauri (MIT/Apache 2.0), React (MIT), valibot (MIT), Lucide (ISC). 파서 시험 문장은 korean-datetime (MIT, `src/parse/fixtures` 참고)에서 가져왔습니다.
