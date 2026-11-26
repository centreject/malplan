import { describe, expect, test } from "vitest";
import { keysOf, withKeys, withoutKeys } from "./llmKeys";
import type { LlmSettings } from "./providers";

const settings: LlmSettings = {
  provider: "anthropic",
  apiKey: "sk-ant",
  model: "claude-opus-5-5",
  baseUrl: "",
  saved: { gemini: { apiKey: "g-key", model: "gemini-2.5-flash-lite" }, local: { apiKey: "", model: "" } },
};

describe("API keys out of app storage", () => {
  test("each provider's key, the one in use and the ones put away", () => {
    expect(Object.fromEntries(keysOf(settings))).toEqual({ gemini: "g-key", anthropic: "sk-ant", openrouter: "", custom: "" });
  });

  test("what goes to app storage holds no key, and nothing else is lost", () => {
    const blank = withoutKeys(settings);

    expect(JSON.stringify(blank)).not.toMatch(/sk-ant|g-key/);
    expect(blank).toMatchObject({ provider: "anthropic", model: "claude-opus-5-5", saved: { gemini: { model: "gemini-2.5-flash-lite" } } });
  });

  test("keys come back where they were; a key typed meanwhile is kept", () => {
    const keys = keysOf(settings);

    expect(withKeys(withoutKeys(settings), keys)).toEqual(settings);
    expect(withKeys({ ...withoutKeys(settings), apiKey: "typed" }, keys).apiKey).toBe("typed");
  });

  test("a key for a provider never used yet is put away for it", () => {
    const keys = new Map([["openrouter", "or-key"]] as const);

    expect(withKeys(withoutKeys(settings), keys).saved.openrouter).toEqual({ apiKey: "or-key", model: "" });
  });
});
