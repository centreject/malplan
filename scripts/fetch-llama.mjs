// Fetch the pinned llama-server CPU build into src-tauri/binaries/llama/ (bundled as a Tauri
// resource, not committed). llama.cpp is MIT licensed. Run: npm run fetch:llama
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TAG = "b11565";

const ZIP = `llama-${TAG}-bin-win-cpu-x64.zip`;

const URL = `https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ZIP}`;

// From `gh release view b11565 -R ggml-org/llama.cpp --json assets`.
const SHA256 = "b45d88c70124b1ca8d8969ce073e81bc22906946d2528cab56c09c7e66420fe2";

const out = join(import.meta.dirname, "..", "src-tauri", "binaries", "llama");

if (existsSync(join(out, "llama-server.exe"))) {
  console.log(`already present: ${out}`);
  process.exit(0);
}

const response = await fetch(URL);

if (!response.ok) {
  throw new Error(`${URL}: HTTP ${response.status}`);
}

const zip = Buffer.from(await response.arrayBuffer());

const actual = createHash("sha256").update(zip).digest("hex");

if (actual !== SHA256) {
  throw new Error(`${ZIP}: SHA256 ${actual}, expected ${SHA256}`);
}

const zipPath = join(tmpdir(), ZIP);

writeFileSync(zipPath, zip);

mkdirSync(out, { recursive: true });

// Windows 10+ ships bsdtar, which reads zip files (Git Bash's GNU tar on PATH does not).
execFileSync(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-xf", zipPath, "-C", out]);

rmSync(zipPath);

// Only the server is used; drop the other tools.
for (const name of readdirSync(out)) {
  if (name.endsWith(".exe") && name !== "llama-server.exe") {
    rmSync(join(out, name));
  }
}

if (!existsSync(join(out, "llama-server.exe"))) {
  throw new Error(`llama-server.exe not found in ${ZIP}`);
}

console.log(`llama-server ${TAG} -> ${out}`);
