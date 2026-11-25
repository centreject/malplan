# Changelog

## 0.2.18 (2026-11-25)

- Parser: "3주 뒤 금요일" is the Friday of the week three weeks away, as "다음주 금요일" is next week's; it used to be today plus 21 days with 금요일 left in the title.
- "…해보기", "알아보기", "물어보기", "찾아보기" read as tasks ("저녁먹자고 해보기"); "영화 보기" stays an event.

## 0.2.17 (2026-11-20)

- Local AI: the warmed prompt cache is saved and loaded on the next start, so the first request after the server starts takes about 3s instead of 12s (Ryzen 5 5600X). The model no longer answers `placeGuessed`; a place the AI filled in is badged when it differs from the rules'. Warm requests: median 3.0s → 2.5s, same accuracy.
- Local AI runs on the GPU through Vulkan when there is one, and on the CPU as before when not. On an RTX 3060 Ti a request takes about 0.25s (CPU: about 2.5s). The installer grows by about 4MB (13.2MB → 17.2MB).

## 0.2.16 (2026-11-20)

- Tab editor: Enter in "분류 추가" adds the category; it used to reload the whole window.
- Parser: "22:00~24:00" ends at midnight, "오전 11:00~1:00" ends at 13:00, "새벽 2시~2시 30분" stays in the morning; "한 시간 후", "십분 뒤", "두 시간 반 후" count from now.
- The sentence input's preview says "일정 N개" when the line opens several cards.
- Week pane in day steps: picking a week shows that week.
- A 시간대 item reminded ahead says when it is ("12시 · 식당 (내일)"); undecided items offer only default or none.
- 말로 고치기: "장소 지우고 메모 지워" clears both.
- An invalid colour code shows the colour in use again.

## 0.2.15 (2026-11-19)

- 말로 고치기: "장소 지워", "메모는 없애줘" empty the field (the AI used to leave it as it was). An AI reply with an empty place or note no longer clears it unless the request asks to remove it.
- AI with a custom server: a server with no model name no longer gets the reply-schema option, which some servers reject.
- Model download: 일시정지 works at once even while a retry waits; a slow line that keeps dropping keeps going; a resume the server refuses starts over instead of failing every time.

## 0.2.14 (2026-11-19)

- An item can hold a checklist of small steps ("여권 챙기기"), ticked in the item's detail view; a repeating item shares one list.
- 말로 고치기: a new date moves a multi-day item whole; an undated task given "오늘" or "오늘 3시" gets that date and time. MCP edit_schedule refuses what the edit screen would refuse.
- Parser: "새벽 2시~4시" and "밤 10시~12시" keep their meridiem, "오전 12시" is midnight, "오늘 2시간 후" late at night is tomorrow, "0일마다" is not a repeat.
- .ics import: importing malplan's own export again keeps checklists, reminders and completions; repeats whose end cannot be read, or limited to some months, come in as one day instead of every day for good; times near a daylight-saving change are right.
- Reminders: a 시간대 item follows its own setting (none, or a lead before the slot); an undecided item set to none leaves the morning summary; 아무때나 has no reminder field.
- Search opens an ended repeat on its last real occurrence and finds checklist steps.
- Fixes: a load failure shows the real error; a late AI answer no longer lands on a new form; no "오늘까지만 반복" on a repeat that has not started; clicking an item in a crowded month cell no longer pins its list; the item detail shows the latest version; a duplicate starts unticked.
- Sync files are on disk before they replace the old ones; MCP on PCs with Korean names no longer share one log file.

## 0.2.13 (2026-11-18)

- Import another calendar's .ics file (마이페이지 → 저장 · 백업): time zones, all-day and multi-day events, repeats with COUNT and exceptions; new items go to a "가져옴" category, and importing the same file again updates them.
- Drag an item to another day in the week and month panes; a repeating item moves only that occurrence. Undo from the toast.
- "10분 후", "2시간 뒤" count from now; "10분 후 회의, 내일 3시 치과" opens two cards.
- Right-click a day for "11/25에 추가"; a repeating item offers 이 일정만 / 이후 전부 / 반복 전체 삭제; every item offers 복제.
- A tab can have its own colour.
- Keyboard: the month grid moves with the arrow keys (one day in the Tab order), and so do the tabs.

## 0.2.12 (2026-11-17)

- Keyboard shortcuts: / focuses the sentence input, T goes to today, ←/→ step a day, Ctrl+Z reverts the last change (listed in 설정 → 정보).
- Month pane: pointing at "+n" shows the day's full list; clicking the day pins it until it is clicked again, somewhere else is clicked, or Escape.
- Week pane: "+n" under a crowded day opens that day.
- Search finds category names too; ↓/↑ move between the box and the results; more than 50 hits says so.
- 백업에서 복원 offers 완전히 되돌리기, which also deletes what the backup does not hold (the button says how many items).
- A morning notification lists unfinished tasks from earlier days.
- MCP: new edit_schedule (the app's 말로 고치기, with a preview first), delete_schedule and uncomplete_task; MCP servers started by several Claude apps on one PC take turns, so changes made at the same moment are no longer lost.

## 0.2.11 (2026-11-17)

- Turning 반복 off on one date of a repeating item keeps the scope choice: 이 일정만 makes that date a one-off and the series goes on. It used to turn the whole series into one item. A done date moved elsewhere stays done.
- 이후 전부 refuses an end date before the chosen day instead of quietly ignoring it.
- An item that runs past midnight ("밤 10시~새벽 1시") also shows at the top of the next day as "~1시 · 전날부터", and its time reads "22시–다음 날 1시".
- Sync: a deletion survives merging with another copy of the folder (the deletion mark is kept a year); a cloud copy of a log no longer makes every refresh rewrite and re-upload the log; a failed refresh shows on the main screen.
- A reminder due in the very minute an item is added or reminders are turned on still fires.
- "0시 5분 전" reads as 23:55 the day before.
- When the AI answers in a form the app cannot read, the note says so instead of disappearing.
- A new folder gets the default categories even if an item was saved before it loaded; choosing the folder already in use does nothing; the merge question says how many unsaved changes will go to the new folder.
- Many tabs scroll sideways instead of widening the month pane; a category made in the edit form gets the least-used colour like everywhere else.

## 0.2.10 (2026-11-16)

- Merging folders no longer brings back an item the source folder deleted (it came back with a few fields when the deletion had been tidied away there).
- An item whose category was deleted on another device, or left out by a folder merge, shows under 미분류 instead of without a color and outside every tab.
- The 저장 데이터 경고 left by an edit to an item deleted long ago no longer stays forever.
- Editing a 기간 end date or an end time: a half-cleared field no longer saves as "no end". Clear it with the × next to it.
- Faster with many repeating tasks: 밀린 할 일 and the list page compute about ten times faster, and the panes reuse their results between redraws.
- The minute refresh reads the sync folder only when a file in it changed.

## 0.2.9 (2026-11-16)

- Merging a folder into one with data keeps both folders' items: nothing from either side is hidden, and items deleted long ago no longer come back.
- A cloud client's copy of a log ("log-a (1).jsonl", "log-a - 복사본.jsonl") is read as part of that device's log. It used to be dropped, or unreadable with a space or parenthesis in its name.
- A PC that no longer writes to the folder (replaced or reinstalled) no longer stops compaction.
- Internal: one rule decides what a completion is stored under, and the local model is described in one place.

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
