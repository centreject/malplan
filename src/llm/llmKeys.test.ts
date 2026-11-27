import { describe, expect, test } from "vitest";
import { createLlmKeyStore, keysOf, withKeys, withoutKeys, type KeyStorage } from "./llmKeys";
import type { LlmSettings } from "./providers";

const settings: LlmSettings = {
  provider: "anthropic",
  apiKey: "sk-ant",
  model: "claude-opus-5-5",
  baseUrl: "",
  saved: { gemini: { apiKey: "g-key", model: "gemini-2.5-flash-lite" }, local: { apiKey: "", model: "" } },
};

type FakeVault = {
  io: KeyStorage;
  secrets: Map<string, string>;
  stored: () => LlmSettings;
  deleted: string[];
};

function fakeVault(initialStored: LlmSettings, initialSecrets: [string, string][] = [], failSave = false, failRead = false): FakeVault {
  let savedSettings = initialStored;
  const secrets = new Map<string, string>(initialSecrets);
  const deleted: string[] = [];

  const io: KeyStorage = {
    readSecret: async (name) => {
      if (failRead) {
        throw new Error("vault locked");
      }

      return secrets.get(name);
    },
    saveSecret: async (name, value) => {
      if (failSave) {
        throw new Error("vault write failed");
      }

      secrets.set(name, value);
    },
    deleteSecret: async (name) => {
      deleted.push(name);
      secrets.delete(name);
    },
    loadSettings: () => savedSettings,
    saveSettings: (next) => {
      savedSettings = next;
    },
  };

  return { io, secrets, stored: () => savedSettings, deleted };
}

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

  test("failed migration keeps legacy keys intact in app storage", async () => {
    const vault = fakeVault(settings, [], true);
    const store = createLlmKeyStore(vault.io);

    await expect(store.load()).rejects.toThrow("vault write failed");
    expect(vault.stored().apiKey).toBe("sk-ant");
    expect(vault.stored().saved.gemini?.apiKey).toBe("g-key");
  });

  test("saving before keys finish loading or after a failed load never deletes Credential Manager secrets", async () => {
    const blank = withoutKeys(settings);
    const vault = fakeVault(blank, [["api-key-anthropic", "sk-ant"], ["api-key-gemini", "g-key"]], false, true);
    const store = createLlmKeyStore(vault.io);

    await expect(store.load()).rejects.toThrow("vault locked");
    await store.save({ ...blank, model: "claude-sonnet-5-5" });

    expect(vault.deleted).toEqual([]);
    expect(vault.secrets.get("api-key-anthropic")).toBe("sk-ant");
    expect(vault.secrets.get("api-key-gemini")).toBe("g-key");
    expect(vault.stored().model).toBe("claude-sonnet-5-5");
  });

  test("clearing a key after load removes it from the Credential Manager", async () => {
    const blank = withoutKeys(settings);
    const vault = fakeVault(blank, [["api-key-anthropic", "sk-ant"], ["api-key-gemini", "g-key"]]);
    const store = createLlmKeyStore(vault.io);

    const loaded = await store.load();

    expect(loaded.get("anthropic")).toBe("sk-ant");

    await store.save({ ...withKeys(blank, loaded), apiKey: "" });

    expect(vault.secrets.has("api-key-anthropic")).toBe(false);
    expect(vault.secrets.get("api-key-gemini")).toBe("g-key");
  });
});
