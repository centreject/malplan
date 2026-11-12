import { describe, expect, test } from "vitest";
import { buildPrompt } from "./extract";
import {
  chatBody,
  connectionErrorText,
  customEndpoint,
  LOCAL_MODEL,
  missingSetting,
  modelNames,
  modelsEndpoint,
  switchProvider,
  type LlmSettings,
} from "./providers";

const prompt = buildPrompt("토요일 친구 결혼식", [{ id: "meet", name: "약속", colorSlot: 1 }], [], "2026-10-11");

describe("customEndpoint", () => {
  test("adds the chat path once, keeping port and prefix", () => {
    expect(customEndpoint("http://127.0.0.1:11434/v1")).toEqual({ url: "http://127.0.0.1:11434/v1/chat/completions" });
    expect(customEndpoint("https://ai.example.com/openai/v1/")).toEqual({ url: "https://ai.example.com/openai/v1/chat/completions" });
    expect(customEndpoint("http://localhost:1234/v1/chat/completions")).toEqual({ url: "http://localhost:1234/v1/chat/completions" });
  });

  test("plain http reaches only this PC and the home network", () => {
    for (const address of ["http://192.168.0.5:8000/v1", "http://10.0.0.2/v1", "http://172.17.0.2:8000/v1", "http://nas.local:8000/v1"]) {
      expect(customEndpoint(address)).toHaveProperty("url");
    }

    for (const address of ["http://ai.example.com/v1", "http://8.8.8.8/v1", "http://172.32.0.1/v1", "http://192.168.0.5.example.com/v1", "ftp://127.0.0.1/v1"]) {
      expect(customEndpoint(address)).toHaveProperty("error");
    }
  });

  test("an empty or unreadable address is an error", () => {
    expect(customEndpoint("")).toHaveProperty("error");
    expect(customEndpoint("127.0.0.1:11434")).toHaveProperty("error");
  });
});

const settings: LlmSettings = { provider: "openrouter", apiKey: "or-key", model: "a/b", baseUrl: "", saved: {} };

describe("switchProvider", () => {
  test("one provider's key never reaches another", () => {
    const custom = switchProvider(settings, "custom");

    expect(custom.apiKey).toBe("");
    expect(custom.model).toBe("");
  });

  test("coming back restores that provider's key and model", () => {
    const back = switchProvider(switchProvider({ ...settings, baseUrl: "http://localhost/v1" }, "custom"), "openrouter");

    expect(back).toMatchObject({ provider: "openrouter", apiKey: "or-key", model: "a/b", baseUrl: "http://localhost/v1" });
  });

  test("a provider used for the first time gets its default model", () => {
    expect(switchProvider(settings, "gemini").model).toBe("gemini-2.5-flash-lite");
  });
});

describe("missingSetting", () => {
  test("names what is missing before anything is sent", () => {
    expect(missingSetting({ ...settings, apiKey: "" })).toContain("API 키");
    expect(missingSetting({ ...settings, model: "" })).toContain("모델");
    expect(missingSetting({ ...settings, provider: "custom" })).toContain("주소");
    expect(missingSetting(settings)).toBeUndefined();
  });

  test("a custom server may have no key or model", () => {
    expect(missingSetting({ ...settings, provider: "custom", apiKey: "", model: "", baseUrl: "http://127.0.0.1:11434/v1" })).toBeUndefined();
  });
});

describe("modelsEndpoint", () => {
  const custom: LlmSettings = { ...settings, provider: "custom", apiKey: "", baseUrl: "http://127.0.0.1:11434/v1" };

  test("sits next to the chat path, whichever form the address was typed in", () => {
    for (const baseUrl of ["http://127.0.0.1:11434/v1", "http://127.0.0.1:11434/v1/", "http://127.0.0.1:11434/v1/models", "http://127.0.0.1:11434/v1/chat/completions"]) {
      expect(modelsEndpoint({ ...custom, baseUrl })).toEqual({ url: "http://127.0.0.1:11434/v1/models" });
    }

    expect(modelsEndpoint(settings)).toEqual({ url: "https://openrouter.ai/api/v1/models" });
    expect(modelsEndpoint({ ...settings, provider: "gemini" })).toEqual({ url: "https://generativelanguage.googleapis.com/v1beta/openai/models" });
  });

  test("keeps a query in the address on the list path too", () => {
    expect(modelsEndpoint({ ...custom, baseUrl: "https://ai.example.com/v1?tenant=me" })).toEqual({ url: "https://ai.example.com/v1/models?tenant=me" });
  });

  test("says why it can't be asked", () => {
    expect(modelsEndpoint({ ...custom, baseUrl: "http://example.com/v1" })).toHaveProperty("error");
    expect(modelsEndpoint({ ...settings, provider: "gemini", apiKey: "" })).toEqual({ error: "API 키를 입력하세요." });
    expect(modelsEndpoint({ ...settings, provider: "anthropic" })).toHaveProperty("error");
  });

  test("OpenRouter's public list needs no key", () => {
    expect(modelsEndpoint({ ...settings, apiKey: "" })).toHaveProperty("url");
  });
});

describe("modelNames", () => {
  test("sorted names, without Gemini's prefix", async () => {
    const response = new Response(JSON.stringify({ object: "list", data: [{ id: "qwen3:4b" }, { id: "models/gemini-2.5-flash", owned_by: "google" }] }));

    expect(await modelNames(response)).toEqual(["gemini-2.5-flash", "qwen3:4b"]);
  });

  test("another shape is undefined", async () => {
    expect(await modelNames(new Response(JSON.stringify({ models: ["a"] })))).toBeUndefined();
  });
});

describe("connectionErrorText", () => {
  test("HTTP failures from either client say what to check", () => {
    expect(connectionErrorText(new Error("HTTP 401"))).toBe("API 키가 맞지 않습니다. (HTTP 401)");
    expect(connectionErrorText(new Error('401 {"type":"error"}'))).toBe("API 키가 맞지 않습니다. (HTTP 401)");
    expect(connectionErrorText(new Error("HTTP 404"))).toContain("모델 이름");
    expect(connectionErrorText(new Error("HTTP 503"))).toBe("서버에 문제가 있습니다. (HTTP 503)");
  });

  test("a port number in a network error is not a status", () => {
    expect(connectionErrorText("error sending request for url (http://127.0.0.1:404/v1)")).toContain("연결하지 못했습니다");
  });

  test("HTML instead of JSON and timeouts get their own text", () => {
    expect(connectionErrorText(new SyntaxError("Unexpected token <"))).toContain("OpenAI 호환");
    expect(connectionErrorText(new DOMException("signal timed out", "TimeoutError"))).toContain("시간이 초과");
  });
});

describe("chatBody", () => {
  test("the local server gets the reply schema with the category choices", () => {
    expect(chatBody(LOCAL_MODEL, prompt)).toContain('"response_format":{"type":"json_schema","json_schema":{"name":"extraction","schema":{"type":"object"');
    expect(chatBody(LOCAL_MODEL, prompt)).toContain('"category":{"enum":["약속","새 분류"]}');
  });

  test("API providers get the plain request", () => {
    expect(chatBody("m", prompt)).not.toContain("response_format");
  });
});
