// fetchModels and testConnection against a real HTTP server on 127.0.0.1 (an "OpenAI 호환 서버" on this PC).
// Outside the desktop app the providers use window.fetch; in Node that is the global fetch, so `window` is pointed at
// globalThis. The desktop app's Rust HTTP client is not exercised here.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { fetchModels, testConnection, type LlmSettings } from "./providers";

type Seen = { method: string; path: string; auth: string | undefined; body: string };

type Reply = { status: number; body: string };

let server: Server;

let base = "";

let seen: Seen[] = [];

let reply: (request: Seen) => Reply = () => ({ status: 500, body: "" });

function handle(request: IncomingMessage, response: ServerResponse): void {
  let body = "";

  request.on("data", (chunk: Buffer) => {
    body += chunk.toString();
  });
  request.on("end", () => {
    const entry: Seen = { method: request.method ?? "", path: request.url ?? "", auth: request.headers.authorization, body };
    const { status, body: text } = reply(entry);

    seen.push(entry);
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(text);
  });
}

beforeAll(async () => {
  vi.stubGlobal("window", globalThis);
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  // SAFETY: a server listening on a TCP port reports an AddressInfo, not a pipe name.
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  seen = [];
});

const custom = (overrides: Partial<LlmSettings> = {}): LlmSettings => ({ provider: "custom", apiKey: "", model: "qwen3:4b", baseUrl: base, saved: {}, ...overrides });

const chat = (content: string | null) => JSON.stringify({ choices: [{ message: { content } }] });

describe("fetchModels", () => {
  test("lists the server's models, sorted, asking with the key", async () => {
    reply = () => ({ status: 200, body: JSON.stringify({ data: [{ id: "qwen3:4b" }, { id: "models/gemma" }] }) });

    expect(await fetchModels(custom({ apiKey: "sk-1" }))).toEqual({ ok: true, models: ["gemma", "qwen3:4b"] });
    expect(seen).toEqual([{ method: "GET", path: "/v1/models", auth: "Bearer sk-1", body: "" }]);
  });

  test("no key, no Authorization header", async () => {
    reply = () => ({ status: 200, body: JSON.stringify({ data: [] }) });

    expect(await fetchModels(custom())).toEqual({ ok: true, models: [] });
    expect(seen[0]?.auth).toBeUndefined();
  });

  test("a refused key, a page that is not JSON, and a list of the wrong shape each say so", async () => {
    reply = () => ({ status: 401, body: "{}" });
    expect(await fetchModels(custom({ apiKey: "bad" }))).toEqual({ ok: false, message: "API 키가 맞지 않습니다. (HTTP 401)" });

    reply = () => ({ status: 200, body: "<html>login</html>" });
    expect(await fetchModels(custom())).toEqual({ ok: false, message: "OpenAI 호환 응답이 아닙니다. 주소를 확인하세요." });

    reply = () => ({ status: 200, body: JSON.stringify({ models: ["a"] }) });
    expect(await fetchModels(custom())).toEqual({ ok: false, message: "모델 목록을 읽을 수 없습니다. 주소를 확인하세요." });
  });

  test("nothing listening: a connection message, not a crash", async () => {
    const closed = createServer();

    await new Promise<void>((resolve) => closed.listen(0, "127.0.0.1", resolve));
    // SAFETY: as above, a TCP listener.
    const port = (closed.address() as AddressInfo).port;

    await new Promise((resolve) => closed.close(resolve));

    const result = await fetchModels(custom({ baseUrl: `http://127.0.0.1:${port}/v1` }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toMatch(/^서버에 연결하지 못했습니다/);
  });
});

describe("testConnection", () => {
  test("sends one small chat request with the model and key, and reports success", async () => {
    reply = () => ({ status: 200, body: chat("확인") });

    const result = await testConnection(custom({ apiKey: "sk-1" }));

    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect([seen[0]?.method, seen[0]?.path, seen[0]?.auth]).toEqual(["POST", "/v1/chat/completions", "Bearer sk-1"]);
    expect(JSON.parse(seen[0]?.body ?? "{}")).toMatchObject({ model: "qwen3:4b", temperature: 0 });
  });

  test("an empty or null reply is a failure that points at the model name", async () => {
    for (const content of ["", "   ", null]) {
      reply = () => ({ status: 200, body: chat(content) });

      expect(await testConnection(custom())).toEqual({ ok: false, message: "서버가 빈 응답을 보냈습니다. 모델 이름을 확인하세요." });
    }
  });

  test("an unknown model and a reply of the wrong shape each say so", async () => {
    reply = () => ({ status: 404, body: "{}" });
    expect(await testConnection(custom())).toEqual({ ok: false, message: "찾을 수 없습니다. 주소와 모델 이름을 확인하세요. (HTTP 404)" });

    reply = () => ({ status: 200, body: JSON.stringify({ choices: [] }) });
    expect((await testConnection(custom())).ok).toBe(false);
  });

  test("an address that may not be used sends nothing", async () => {
    expect(await testConnection(custom({ baseUrl: "http://ai.example.com/v1" }))).toMatchObject({ ok: false });
    expect(await testConnection(custom({ baseUrl: "" }))).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
  });
});
