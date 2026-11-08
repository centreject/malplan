# Changelog

## 0.2.5 (2026-11-08)

- New categories where you pick them: a 새 분류 button beside the category field in 새 항목 확인, and a "분류 추가" field at the bottom of the 전체 filter and in the tab editor. A name already in use picks that category.
- Unsaved changes or an unreadable sync folder show as a bar above the board, with a link to 저장 설정.
- A range with a time ("11/3~11/5 오후 2시") exports to .ics as 14:00 on each day, matching reminders and the day view, instead of one long event.

## 0.2.4 (2026-11-08)

- AI settings: 연결 테스트 for online and custom servers names what to check; 모델 목록 받기 offers the server's models. Key, address and model save as typed and show what is saved. Keys are kept per provider.
- No edit is lost: a failed save (a locked OneDrive or NAS file) keeps the change and retries; edits made while loading or switching folders wait and are saved once the folder is ready; a failed load retries every minute.
- Sync folders: a new device's starter categories no longer undo renames or deletions from other devices; a cloud "conflicted copy" or other stray file no longer blocks loading; a log line cut inside a Hangul character costs only that line; merging into a folder with a snapshot keeps both.
- A range task checked on any day of its range is done.
- Reminders: "없음" means no reminder (the default is its own choice); moving an item later the same day reminds again; after sleep, items that already started do not fire in a burst.
- Rules without AI pick a category from the sentence's words (회의 → work, 과제 → school, …); a category name counts only at a word's start (고등학교 is not 학교); "한시 인하" is no longer read as 1시.
- MCP: several tool calls at once no longer overwrite each other.
- Moving an overdue recurring task no longer arrives already done; clearing part of a repeat's end date no longer makes it endless.

## 0.2.3 (2026-11-04)

- AI 변환 can use any OpenAI-compatible server (Ollama, LM Studio, self-hosted): enter its address, an optional key and a model name. External servers need https; plain http works only on this PC and private networks.

## 0.2.2 (2026-11-02)

- AI category picks are more accurate: prompt examples now use your own category names, and broad categories like 개인 are chosen last. Held-out test sentences: category 71 → 78 of 90, overall 90% → 92%.

## 0.2.1 (2026-11-01)

- First update delivered through the in-app updater (checks the 0.2.0 → 0.2.1 path end to end). No other changes.

## 0.2.0 (2026-11-01)

- Automatic updates: right after start the app checks GitHub Releases and offers 나중에 / 지금 업데이트; 마이페이지 → 정보 has 업데이트 확인. Updates are signed and verified before installing. Install 0.2.0 by hand once; later versions arrive in the app.
- Releases are built by GitHub Actions from a version tag.

## 0.1.1 (2026-11-01)

First release with a download.

- New app icon (a speech-bubble calendar) with a simpler version for the tray and taskbar.
- Smaller bundle: only the llama.cpp files llama-server needs.
- README in Korean (default, README.md) and English (README.en.md) with logo, badges, screenshots and a flow diagram; MIT license.

## 0.1.0 (2026-10-25)

First public version (beta, Windows).

- Natural-language entry with a confirm screen; rule-based Korean date/time parser (86.7% of schedule expressions on the public test set).
- Local AI (Qwen3 4B via llama.cpp) for title, kind, category and place, with optional Claude, Gemini or OpenRouter keys.
- Today / week / month views, category tabs, year/month/week pickers, overdue list with missed dates.
- 말로 고치기: edit a saved item by saying what to change.
- Folder sync with per-device logs and field-level merge.
- MCP server for Claude Code, Claude Desktop, Gemini CLI, Antigravity and Codex.
- Four themes in light and dark, high contrast, text size; Korean holidays, reminders, search, ICS export, backups.
- Single instance, content security policy, crash screen, log file, per-user NSIS installer.
