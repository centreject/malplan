# malplan

Natural-language schedule/todo app. Spec: `SPEC.md` (Korean). Stack: Tauri 2 + React + TypeScript.

## Answer style
- Conclusion first, then only what's needed. Tables/lists over prose.
- Reply to the user in Korean.
- Shell commands for the user: PowerShell syntax (Windows).

## Coding rules
- Think before coding: restate the goal and a checkable success criterion; ask if ambiguous.
- Simplest thing that works. No speculative abstractions, options, or dependencies.
- Surgical changes: touch only what the task needs; no drive-by refactors.
- Logic lives in TypeScript (`src/`). Keep Rust (`src-tauri/`) thin: plugins and process glue only.
- Dates, times, recurrence are computed by code, never by the LLM.
- Pass "now"/today as a parameter; never read the clock inside logic. Tests use real seams, not module mocks.
- Validate every external boundary (LLM JSON, sync files, Drive API) with valibot schemas.

## Verification before completion
- Never claim done/working without running `npm run check` (oxlint + anti-slop, tsc, vitest) and `npm run build`, and reading the output.
- Never write files with PowerShell `Set-Content`/`Out-File` (Windows PowerShell 5.1 adds a BOM that breaks JSON loaders). Use the editor tools.
- Rust changes: also `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings`.
- Report failures as failures, with the output.

## Lint
- `tools/oxlint/anti-slop/` is vendored (see its `UPSTREAM.md`). Fix code to satisfy rules; don't disable rules to pass.
- Type assertions need a `// SAFETY: <invariant>` comment directly above.
