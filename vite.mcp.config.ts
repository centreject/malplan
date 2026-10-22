import { defineConfig } from "vite";

// The MCP server as one Node file with its dependencies inlined: node dist-mcp/malplan-mcp.mjs
export default defineConfig({
  build: {
    ssr: "src/mcp/main.ts",
    outDir: "dist-mcp",
    emptyOutDir: true,
    target: "node20",
    rollupOptions: { output: { format: "es", entryFileNames: "malplan-mcp.mjs" } },
  },
  ssr: { noExternal: true, target: "node" },
});
