import { describe, expect, test } from "vitest";
import { buildPrompt } from "./extract";
import { chatBody, LOCAL_ENDPOINT } from "./providers";

const prompt = buildPrompt("토요일 친구 결혼식", [{ id: "meet", name: "약속", colorSlot: 1 }], [], "2026-10-11");

describe("chatBody", () => {
  test("the local server gets the reply schema with the category choices", () => {
    expect(chatBody(LOCAL_ENDPOINT, "local", prompt)).toContain('"response_format":{"type":"json_schema","json_schema":{"name":"extraction","schema":{"type":"object"');
    expect(chatBody(LOCAL_ENDPOINT, "local", prompt)).toContain('"category":{"enum":["약속","새 분류"]}');
  });

  test("API providers get the plain request", () => {
    expect(chatBody("https://openrouter.ai/api/v1/chat/completions", "m", prompt)).not.toContain("response_format");
  });
});
