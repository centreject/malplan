import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// SAFETY: package.json is the project's own manifest and always has a string version.
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

// The MCP server as one Node file with its dependencies inlined: node dist-mcp/malplan-mcp.mjs
export default defineConfig({
  // The server reports the app's version without a copy to keep in step.
  define: { MALPLAN_VERSION: JSON.stringify(version) },
  build: {
    ssr: "src/mcp/main.ts",
    outDir: "dist-mcp",
    emptyOutDir: true,
    target: "node20",
    rollupOptions: { output: { format: "es", entryFileNames: "malplan-mcp.mjs" } },
  },
  ssr: { noExternal: true, target: "node" },
});
