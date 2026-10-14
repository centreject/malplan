import { defineConfig } from "vitest/config";

// AI extraction eval: needs a running local llama-server, so it stays out of `npm test`.
export default defineConfig({
  test: { include: ["src/**/*.eval.ts"], fileParallelism: false },
});
