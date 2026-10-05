// PostToolUse hook: lint + typecheck after Claude edits a TS/TSX file under src/.
// Exit code 2 feeds stderr back to Claude so it must fix the errors.
import { execSync } from "node:child_process";

let raw = "";

for await (const chunk of process.stdin) {
  raw += chunk;
}

const filePath = JSON.parse(raw.replace(/^﻿/, "")).tool_input?.file_path ?? "";
const normalized = filePath.replaceAll("\\", "/");

if (!/\/src\/.*\.tsx?$/.test(normalized)) {
  process.exit(0);
}

try {
  execSync(`npx oxlint "${filePath}"`, { stdio: "pipe" });
  execSync("npx tsc --noEmit", { stdio: "pipe" });
} catch (error) {
  process.stderr.write(`${error.stdout ?? ""}${error.stderr ?? ""}`);
  process.exit(2);
}
