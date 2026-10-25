# malplan

**English** | [한국어](README.ko.md)

Type a schedule in one Korean sentence, check the card it fills in, and see it in today, this week and this month at once.

> 12월 28일까지 매주 수요일 오후 4시 회사 우편물 발송
>
> → every Wednesday, 16:00, until 12/28 · category 회사 · task

malplan is a Windows desktop app for appointments and to-dos. Dates and times are read by code, never guessed by a model; a small AI model that runs on your PC only tidies the title, category and place. Nothing is saved until you confirm it.

**Status: v0.1.0 (beta).** Windows 10/11 x64. No signed installer or auto-update yet.

## Features

- **One sentence in, a card out**: dates, times, ranges and repeats ("매주 월·목", "매월 마지막 금요일", "격주", "3개월마다") are parsed by rules; the confirm screen marks every guess as 추정.
- **Today / week / month on one screen**, with calendar tabs per category, a year/month/week picker in the titles, and an overdue list that keeps every missed task until it is done.
- **말로 고치기**: edit a saved item by saying what to change ("3시로 바꿔", "하루 미뤄", "장소는 강남역으로").
- **Local AI, optional API keys**: Qwen3 4B runs through llama.cpp on your PC (one 2.5GB download, then offline). Claude, Gemini or OpenRouter keys can be used instead.
- **Sync through a folder you choose** (local, NAS or a cloud-synced folder): each device writes its own log and changes merge per field.
- **AI tools (MCP)**: Claude Code, Claude Desktop, Gemini CLI, Antigravity and Codex can list, find and add schedules.
- Korean holidays (lunar included), reminders, search, ICS export, backups, tray, autostart, a global shortcut you choose.
- Four themes (bus board, desk calendar, standard, high contrast), each in light and dark, and three text sizes.

## How it works

| Part | What decides it |
|---|---|
| Date, time, repeat | A rule-based Korean parser ([`src/parse`](src/parse)), measured on 1,182 public test phrases: 86.7% of schedule expressions correct |
| Title, kind, category, place | The local model (or an API), checked against the rules: about 90% of fields correct on 90 held-out sentences |
| Saving | You, on the confirm screen |

The model only starts when you focus the input, and stops after 10 minutes idle. What you type stays on your PC unless you choose an API provider.

## Install

There is no release build yet. To run it from source:

```bash
npm ci
npm run fetch:llama   # llama-server CPU build (pinned, checked by SHA256)
npm run tauri dev
```

The first run offers to download the AI model (2.5GB, Apache 2.0) into `%LOCALAPPDATA%\com.centreject.malplan\models`. Without it, dates and times still work by rules.

To build the installer (NSIS, per-user, no admin rights): `npx tauri build`.

**Requirements**: Windows 10/11 x64, WebView2 (built into Windows 11), about 3GB free disk for the model, 8GB RAM recommended.

## Use it from AI tools (MCP)

malplan ships a small MCP server (`mcp/malplan-mcp.mjs` in the install folder; needs Node.js). 마이페이지 → AI 도구 연결 shows the exact command or config for your PC. For Claude Code:

```bash
claude mcp add malplan -- node "<install folder>\mcp\malplan-mcp.mjs" --dir "<sync folder>"
```

Tools: `list_schedule`, `find_schedule`, `preview_schedule`, `add_schedule`, `complete_task`. Dates are always computed by malplan's own parser, and adding goes through a preview first.

## Development

| Command | What it does |
|---|---|
| `npm run check` | oxlint (with the vendored anti-slop rules), TypeScript, Vitest |
| `npm run build` | Frontend build |
| `npm run build:mcp` | MCP server bundle (`dist-mcp/`) |
| `npm run bench:parse` | Parser score on the public test phrases |
| `npm run bench:llm` | AI extraction score (needs llama-server running) |

Logic lives in TypeScript (`src/`); Rust (`src-tauri/`) only hosts plugins and processes. Every external input (model replies, sync files, MCP calls) is validated with valibot.

```
src/
  domain/   items, recurrence, schedule, edits (pure, tested)
  parse/    Korean date/time parser and its test set
  llm/      prompts, providers, local server control
  storage/  sync folder: per-device logs, field-level merge
  mcp/      MCP server (tools.ts is pure; main.ts is the Node glue)
  ui/       React components
src-tauri/  Tauri shell: tray, shortcut, llama-server process, model download
docs/       spec, plan, product and design notes (Korean)
```

## Docs

- [docs/SPEC.md](docs/SPEC.md): the confirmed spec (Korean)
- [docs/PLAN.md](docs/PLAN.md): plan, measurements and progress log
- [docs/DESIGN.md](docs/DESIGN.md): design system

## License

malplan's own license has not been chosen yet. Bundled and downloaded components keep their licenses: llama.cpp (MIT), Qwen3 4B (Apache 2.0), Tauri (MIT/Apache 2.0), React (MIT), valibot (MIT), Lucide (ISC). The parser test phrases come from korean-datetime (MIT, see `src/parse/fixtures`).
