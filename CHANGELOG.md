# Changelog

## 0.2.8 (2026-11-16)

- Saving an edit applies only the fields you changed, so a title or a check made on another device meanwhile is kept.
- Finish tasks from more places: 밀린 할 일 and 날짜 없는 할 일 rows have a check button; the item details have 완료 / 완료 취소 and 삭제; a check can be undone from the toast.
- Right-click an item for 열기, 수정, 완료, 삭제, or a tab for 탭 편집.
- 저장 · 백업 → 백업에서 복원 (JSON): records come back by id, records added since stay, nothing is deleted. The file is applied only after 복원.
- A time may end the next day ("밤 10시~새벽 1시"); the form marks it "다음 날 끝남".
- The morning "시간 미정" summary comes on the first check between 8 and noon, not only at 08:00.
- An event no longer shows a completion left from when it was a task; a finished repeating task can be unticked from the list.
- Sync: a device that has the logs but not yet the snapshot does not compact; a snapshot that briefly goes missing no longer empties the board; a save retried later keeps its edit time; changes waiting to be saved survive quitting the app.
- When several sentences go to the AI at once and only some fail, the note says how many.
- Reminder leads read the same everywhere, and an item can pick 5 or 15 minutes.
- Faster: missed dates are remembered per item, and typing in the sentence input no longer redraws the board.
- Layout: arrows beside the pane titles, long tab names end in "…", the desk theme uses the shared numeral sizes, and in a narrow window the sentence input stays at the top.

## 0.2.7 (2026-11-12)

- Sync: ticking different days of a repeating task on two devices keeps both. Items added on this version still show on devices running 0.2.6 or older.
- Sync: two devices compacting at once (a cloud folder syncing late) no longer lose entries; a device keeps folded entries for 7 days after the compaction.
- Local AI starts on a free port, so another program on port 8357 no longer blocks it.
- Editing: 말로 고치기 "하루 미뤄" on an undated task makes it a dated task; the custom AI server's key is cleared when its address points to another server.
- A failed update install says so, and the app checks for updates once a day. Folder switch, model delete and autostart failures are shown.
- Ctrl+F does not open search over an open dialog; a reminder lead set elsewhere shows as itself in the form.
- Rules without AI no longer treat 공모, 동기, 시험, 영화 as category clues.
- MCP rejects dates that do not exist.
- Release builds: actions pinned to commits, the signing key kept out of npm steps, redirects checked against allowed addresses.

## 0.2.6 (2026-11-08)

- Editing: turning repeat off on one occurrence makes a single item on that date; the repeat interval field can be cleared while typing; an AI-proposed new category name can be edited.
- After midnight, views left on today move to the new day.
- 밀린 할 일: a picked date moves items only on the 옮기기 click, not while typing.
- Deleting a category no longer empties the 전체 filter view. Dragging the custom colour saves once.
- A late 말로 고치기 answer no longer closes another item's details.
- .ics export: every-other-week counts from Sunday (WKST=SU); a late event without an end lasts an hour into the next day.
- Local AI: a real start error shows after a former "no model" state; stopping during startup no longer makes the next request wait 60 s.
- MCP: a locked sync file fails the call instead of reading as empty.
- AI examples skip corrections for renamed or deleted categories.

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
