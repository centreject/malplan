# Changelog

## 0.2.0 (2026-11-01)

- Automatic updates: a few seconds after start the app checks GitHub Releases and offers 나중에 / 지금 업데이트; 마이페이지 → 정보 has 업데이트 확인. Updates are signed and verified before installing. Install 0.2.0 by hand once; later versions arrive in the app.
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
