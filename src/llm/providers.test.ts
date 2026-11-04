import { describe, expect, test } from "vitest";
import { buildPrompt } from "./extract";
import { chatBody, customEndpoint, LOCAL_ENDPOINT } from "./providers";

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

describe("chatBody", () => {
  test("the local server gets the reply schema with the category choices", () => {
    expect(chatBody(LOCAL_ENDPOINT, "local", prompt)).toContain('"response_format":{"type":"json_schema","json_schema":{"name":"extraction","schema":{"type":"object"');
    expect(chatBody(LOCAL_ENDPOINT, "local", prompt)).toContain('"category":{"enum":["약속","새 분류"]}');
  });

  test("API providers get the plain request", () => {
    expect(chatBody("https://openrouter.ai/api/v1/chat/completions", "m", prompt)).not.toContain("response_format");
  });
});
