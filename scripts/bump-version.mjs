// Sets the app version everywhere it is written: npm run version:bump -- 0.2.15
// The MCP server takes it from package.json at build time (vite.mcp.config.ts). Each place must match exactly once,
// so a file that changed shape stops the script instead of being left behind.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const next = process.argv[2] ?? "";

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  throw new Error(`usage: npm run version:bump -- X.Y.Z (got "${next}")`);
}

const root = join(import.meta.dirname, "..");

const read = (file) => readFileSync(join(root, file), "utf8");

const current = JSON.parse(read("package.json")).version;

function replaceOnce(file, from, to) {
  const text = read(file);
  const count = text.split(from).length - 1;

  if (count !== 1) {
    throw new Error(`${file}: expected one "${from}", found ${count}`);
  }

  writeFileSync(join(root, file), text.replace(from, to));
}

const lock = JSON.parse(read("package-lock.json"));

lock.version = next;

lock.packages[""].version = next;

writeFileSync(join(root, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);

replaceOnce("package.json", `"version": "${current}"`, `"version": "${next}"`);

replaceOnce("src-tauri/tauri.conf.json", `"version": "${current}"`, `"version": "${next}"`);

replaceOnce("src-tauri/Cargo.toml", `\nversion = "${current}"`, `\nversion = "${next}"`);

replaceOnce("src-tauri/Cargo.lock", `name = "malplan"\nversion = "${current}"`, `name = "malplan"\nversion = "${next}"`);

replaceOnce("README.md", `**상태: v${current}`, `**상태: v${next}`);

replaceOnce("README.en.md", `**Status: v${current}`, `**Status: v${next}`);

console.log(`${current} -> ${next}`);
