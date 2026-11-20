// Fetch the pinned llama-server Vulkan build into src-tauri/binaries/llama/ (bundled as a Tauri
// resource, not committed). It runs on the GPU through Vulkan and falls back to its CPU backends without one.
// llama.cpp is MIT licensed. Run: npm run fetch:llama
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TAG = "b11565";

const ZIP = `llama-${TAG}-bin-win-vulkan-x64.zip`;

const URL = `https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/${ZIP}`;

// From `gh release view b11565 -R ggml-org/llama.cpp --json assets`.
const SHA256 = "d21649a9cc9dc063d88848ffa9ae3986222c9e953f2f950e993e00e49cedfe21";

const out = join(import.meta.dirname, "..", "src-tauri", "binaries", "llama");

// Only the server is used; drop the other tools, their libraries and the RPC backend (also from an older fetch).
const UNUSED = /^(?!llama-server)[\w-]+-impl\.dll$|^ggml-rpc/;

function prune() {
  for (const name of readdirSync(out)) {
    if ((name.endsWith(".exe") && name !== "llama-server.exe") || UNUSED.test(name)) {
      rmSync(join(out, name));
    }
  }
}

/** The build of the server already here ("version: 0.6.0-dev (build 11565, …)" on stderr), or undefined. */
function presentBuild() {
  const exe = join(out, "llama-server.exe");

  if (!existsSync(exe)) {
    return undefined;
  }

  const run = spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 20_000 });

  return /build (\d+)/.exec(`${run.stdout ?? ""}${run.stderr ?? ""}`)?.[1];
}

const present = presentBuild();

// The CPU build of the same tag has no Vulkan backend: fetch over it.
if (present === TAG.slice(1) && existsSync(join(out, "ggml-vulkan.dll"))) {
  prune();
  console.log(`already present: ${out}`);
  process.exit(0);
}

// Another build (TAG was raised, or the CPU build): clear it, or its DLLs would mix with the new ones.
if (present !== undefined || existsSync(out)) {
  rmSync(out, { recursive: true, force: true });
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

prune();

if (!existsSync(join(out, "llama-server.exe"))) {
  throw new Error(`llama-server.exe not found in ${ZIP}`);
}

console.log(`llama-server ${TAG} -> ${out}`);
