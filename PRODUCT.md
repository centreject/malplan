# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Tauri 2 desktop app rendering a web UI in WebView2. Windows first; mobile later.)

## Users

General users who manage both appointments and todos across several personal devices (PC, laptop, later phone). They keep the app running all day and glance at it often; they enter schedules by typing a sentence in Korean rather than filling forms. They do not know or care about LLM models or sync internals.

## Product Purpose

Type a schedule in natural Korean ("12월 28일까지 매주 수요일 오후 4시 회사 우편물 발송"), confirm a pre-filled card, and see it in today / this week / this month views at once. Success: entering a schedule takes one sentence and one confirm, and the day, week and month are readable at a glance.

## Positioning

Natural-language entry processed locally (rule-based dates + on-demand small local LLM), always confirmed before saving, with three time horizons visible simultaneously and per-category calendar tabs. Data is stored where the user chooses (local folder, NAS, Google Drive).

## Operating Context

- Always-on desktop app; lives in the tray. Used both as a small window docked beside other work and as a large window opened on demand — layout must work in both.
- Target hardware floor: Ryzen 5 4500U laptops. Idle CPU/RAM/network must be near zero.
- Global hotkey opens the natural-language input.

## Capabilities and Constraints

See `SPEC.md` for the full confirmed spec. Key terms:
- 항목 종류: 일정 (no checkbox) / 할 일 (checkbox, overdue list) / 날짜 없는 할 일.
- 시간: exact time (minutes shown only when non-zero), slot (아침/점심/저녁/밤), 미정, 아무때나.
- 분류: user-created flat categories with colors. 탭: saved category filters applying to all three views; default "전체" tab cannot be deleted.
- Week starts on Sunday by default (configurable).
- Undecided: code signing for distribution.

## Brand Commitments

Name: malplan (말 + plan). UI language: Korean.

## Evidence on Hand

No real user data, testimonials or screenshots yet. Do not fabricate any.

## Product Principles

1. Glanceable first: today/week/month must read in a second, even in a small window.
2. Confirm, never surprise: nothing is saved without the user seeing it; guesses are marked "추정".
3. Invisible machinery: no model names, sync jargon or setup burden in the main UI.
4. Light footprint: an always-on app must not cost the machine anything at idle.

## Accessibility & Inclusion

Standard contrast and keyboard operability, plus user-adjustable larger text and a high-contrast theme.
