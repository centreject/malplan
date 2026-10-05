import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    ".claude/**",
    "dist/**",
    "src-tauri/**",
    "tools/oxlint/anti-slop/**",
  ],
  plugins: ["typescript", "react", "unicorn", "oxc"],
  categories: {
    correctness: "error",
    suspicious: "error",
  },
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "error",
    "eslint/no-unused-vars": "error",
    // React 17+ automatic JSX runtime: no `React` import needed.
    "react/react-in-jsx-scope": "off",
    "oxc/no-accumulating-spread": "error",
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
});
