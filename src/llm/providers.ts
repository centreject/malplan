// Where the extraction prompt is sent. Local (llama-server) is the default; an API key is the
// opt-in alternative. Every provider returns plain text; extract.ts validates it.
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import * as v from "valibot";
import { loadStored, saveStored } from "../storage/localStore";
import { replySchema, type Prompt, type ReplyJsonSchema } from "./extract";
import { LOCAL_ORIGIN, localServer } from "./localServer";

export const PROVIDERS = [
  { id: "local", name: "로컬 (이 PC에서 처리)" },
  { id: "gemini", name: "Google Gemini API" },
  { id: "anthropic", name: "Claude API" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "custom", name: "OpenAI 호환 서버 (주소 직접 입력)" },
  { id: "off", name: "사용 안 함 (규칙 기반만)" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  local: "",
  gemini: "gemini-2.5-flash-lite",
  anthropic: "claude-opus-5-5",
  openrouter: "",
  custom: "",
  off: "",
};

/** Claude models offered in settings; the per-call cost differs a lot for this tiny task. */
export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5 (가장 정확, 1회 약 $0.007)" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5 (1회 약 $0.004)" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5 (가장 저렴, 1회 약 $0.0002)" },
] as const;

const SettingsSchema = v.object({
  provider: v.optional(v.picklist(PROVIDERS.map((p) => p.id)), "local"),
  apiKey: v.optional(v.string(), ""),
  model: v.optional(v.string(), ""),
  baseUrl: v.optional(v.string(), ""),
  /** Key and model of the providers not in use, so one provider's key never goes to another. */
  saved: v.optional(v.record(v.string(), v.object({ apiKey: v.string(), model: v.string() })), {}),
});

export type LlmSettings = v.InferOutput<typeof SettingsSchema>;

const STORAGE_KEY = "malplan.llm";

/** Local llama-server's OpenAI-compatible endpoint (started on demand once installed). */
export const LOCAL_ENDPOINT = `${LOCAL_ORIGIN}/v1/chat/completions`;

const TIMEOUT_MS = 30_000;

/** A self-hosted server may have to load its model first. */
const CUSTOM_TIMEOUT_MS = 120_000;

/** Plain http only inside this PC or the home network. Keep in step with the http scope in capabilities/default.json. */
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|[\w.-]+\.local)$/;

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** The chat endpoint of a user-entered server ("…/v1", "…/v1/models" or the full path), or why the address can't be used. */
export function customEndpoint(baseUrl: string): { url: string } | { error: string } {
  if (!URL.canParse(baseUrl)) {
    return { error: "주소를 입력하세요. 예: http://127.0.0.1:11434/v1" };
  }

  const url = new URL(baseUrl);

  if (url.protocol !== "https:" && !(url.protocol === "http:" && PRIVATE_HOST.test(url.hostname))) {
    return { error: "외부 서버는 https 주소만 쓸 수 있습니다. http는 이 PC와 내부망(10.x, 172.16~31.x, 192.168.x, .local)만 됩니다." };
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/(chat\/completions|models)$/, "")}/chat/completions`;

  return { url: url.href };
}

export function loadLlmSettings(): LlmSettings {
  return loadStored(STORAGE_KEY, SettingsSchema, v.parse(SettingsSchema, {}));
}

export function saveLlmSettings(settings: LlmSettings): void {
  saveStored(STORAGE_KEY, settings);
}

/** Puts the current key and model away and brings back what the chosen provider had. */
export function switchProvider(settings: LlmSettings, provider: ProviderId): LlmSettings {
  const saved = { ...settings.saved, [settings.provider]: { apiKey: settings.apiKey, model: settings.model } };
  const next = saved[provider];

  return { ...settings, provider, saved, apiKey: next?.apiKey ?? "", model: next?.model ?? DEFAULT_MODELS[provider] };
}

/** The desktop app goes through the Rust HTTP plugin (no CORS); the browser preview uses fetch. */
const httpFetch: typeof window.fetch = (input, init) => (isTauri() ? tauriFetch(input, init) : window.fetch(input, init));

const ChatReply = v.object({
  choices: v.pipe(v.array(v.object({ message: v.object({ content: v.nullable(v.string()) }) })), v.minLength(1)),
});

/** The reply text of an OpenAI-compatible chat response; undefined when the shape is wrong. */
export async function chatContent(response: Response): Promise<string | undefined> {
  const parsed = v.safeParse(ChatReply, await response.json());

  return parsed.success ? (parsed.output.choices[0]?.message.content ?? "") : undefined;
}

type ChatBody = {
  model: string;
  temperature: number;
  messages: { role: "system" | "user"; content: string }[];
  response_format?: { type: "json_schema"; json_schema: { name: string; schema: ReplyJsonSchema } };
};

/** Request body. Only the local server gets the reply schema (it constrains sampling); others keep plain JSON. */
export function chatBody(url: string, model: string, prompt: Prompt): string {
  const body: ChatBody = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  };

  if (url === LOCAL_ENDPOINT) {
    body.response_format = { type: "json_schema", json_schema: { name: "extraction", schema: prompt.schema } };
  }

  return JSON.stringify(body);
}

async function openAiCompatible(url: string, apiKey: string, model: string, prompt: Prompt, timeout = TIMEOUT_MS): Promise<string> {
  const headers = new Headers({ "Content-Type": "application/json" });

  if (apiKey !== "") {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  const response = await httpFetch(url, {
    method: "POST",
    headers,
    body: chatBody(url, model, prompt),
    signal: AbortSignal.timeout(timeout),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const content = await chatContent(response);

  if (content === undefined) {
    throw new Error("응답 형식을 읽을 수 없습니다.");
  }

  return content;
}

async function claude(apiKey: string, model: string, prompt: Prompt): Promise<string> {
  // Loaded only when Claude is chosen: keeps the always-on app's startup bundle small.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // The key is the user's own and stays on their machine; the desktop app calls Anthropic directly.
  const client = new Anthropic({ apiKey, fetch: httpFetch, dangerouslyAllowBrowser: true, timeout: TIMEOUT_MS, maxRetries: 1 });

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    // A small extraction: lowest effort keeps it fast and cheap.
    output_config: { effort: "low" },
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("요청이 거절되었습니다.");
  }

  return response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
}

/** Send the prompt to the chosen provider. Throws with a short Korean message on failure. */
export async function complete(settings: LlmSettings, prompt: Prompt): Promise<string> {
  const model = settings.model === "" ? DEFAULT_MODELS[settings.provider] : settings.model;

  switch (settings.provider) {
    case "local":
      await localServer?.ensure();

      return openAiCompatible(LOCAL_ENDPOINT, "", "local", prompt);
    case "gemini":
      return openAiCompatible(GEMINI_ENDPOINT, settings.apiKey, model, prompt);
    case "openrouter":
      if (model === "") {
        throw new Error("OpenRouter 모델 이름을 설정에 입력하세요.");
      }

      return openAiCompatible(OPENROUTER_ENDPOINT, settings.apiKey, model, prompt);
    case "custom": {
      const endpoint = customEndpoint(settings.baseUrl);

      if ("error" in endpoint) {
        throw new Error(endpoint.error);
      }

      // llama.cpp ignores the name; servers that need one (Ollama) answer with their own error.
      return openAiCompatible(endpoint.url, settings.apiKey, model === "" ? "local" : model, prompt, CUSTOM_TIMEOUT_MS);
    }

    case "anthropic":
      return claude(settings.apiKey, model, prompt);
    case "off":
      throw new Error("AI 변환이 꺼져 있습니다.");
  }
}

/** What must be filled in before a request can work; undefined when nothing is missing. */
export function missingSetting(settings: LlmSettings): string | undefined {
  if (settings.provider === "custom") {
    const endpoint = customEndpoint(settings.baseUrl);

    return "error" in endpoint ? endpoint.error : undefined;
  }

  if (settings.apiKey === "") {
    return "API 키를 입력하세요.";
  }

  return settings.provider === "openrouter" && settings.model === "" ? "OpenRouter 모델 이름을 입력하세요." : undefined;
}

const HTTP_STATUS_TEXT = new Map([
  ["400", "요청이 거절되었습니다. 모델 이름을 확인하세요."],
  ["401", "API 키가 맞지 않습니다."],
  ["403", "이 키로는 사용할 수 없습니다. 키 권한을 확인하세요."],
  ["404", "찾을 수 없습니다. 주소와 모델 이름을 확인하세요."],
  ["429", "요청 한도를 넘었습니다. 잠시 뒤 다시 시도하거나 요금제를 확인하세요."],
]);

/** Plain Korean for a failed request. The app's HTTP client can reject with a bare string. */
export function connectionErrorText(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  // "HTTP 401" from openAiCompatible, "401 {...}" from the Anthropic SDK.
  const status = /^(?:HTTP )?([45]\d\d)\b/.exec(message)?.[1];

  if (status !== undefined) {
    return `${HTTP_STATUS_TEXT.get(status) ?? "서버에 문제가 있습니다."} (HTTP ${status})`;
  }

  if (error instanceof SyntaxError) {
    return "OpenAI 호환 응답이 아닙니다. 주소를 확인하세요.";
  }

  if (/timeout|timed out|cancel|abort/i.test(message) || (error instanceof Error && error.name === "TimeoutError")) {
    return "응답을 기다리다 시간이 초과되었습니다.";
  }

  return `서버에 연결하지 못했습니다. 주소와 서버 실행 여부를 확인하세요. (${message})`;
}

/** The OpenAI-style model list address, or why it can't be asked yet. Claude has no list here: its models are fixed in settings. */
export function modelsEndpoint(settings: LlmSettings): { url: string } | { error: string } {
  const chat = settings.provider === "custom" ? customEndpoint(settings.baseUrl)
    : settings.provider === "gemini" ? { url: GEMINI_ENDPOINT }
    : settings.provider === "openrouter" ? { url: OPENROUTER_ENDPOINT }
    : { error: "이 처리 방식은 모델 목록을 받지 않습니다." };

  if ("error" in chat) {
    return chat;
  }

  // Gemini answers only with a key; OpenRouter's list is public.
  return settings.provider === "gemini" && settings.apiKey === ""
    ? { error: "API 키를 입력하세요." }
    : { url: chat.url.replace(/\/chat\/completions$/, "/models") };
}

const ModelList = v.object({ data: v.array(v.object({ id: v.string() })) });

/** Model names from a list response, sorted; undefined when the shape is wrong. Gemini prefixes its ids with "models/". */
export async function modelNames(response: Response): Promise<string[] | undefined> {
  const parsed = v.safeParse(ModelList, await response.json());

  return parsed.success ? parsed.output.data.map((model) => model.id.replace(/^models\//, "")).toSorted() : undefined;
}

export type ModelListResult = { ok: true; models: string[] } | { ok: false; message: string };

/** Asks the server which models it has. Reads a list only, so it uses no tokens. */
export async function fetchModels(settings: LlmSettings): Promise<ModelListResult> {
  const endpoint = modelsEndpoint(settings);

  if ("error" in endpoint) {
    return { ok: false, message: endpoint.error };
  }

  try {
    const response = await httpFetch(endpoint.url, {
      headers: settings.apiKey === "" ? {} : { Authorization: `Bearer ${settings.apiKey}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, message: connectionErrorText(`HTTP ${response.status}`) };
    }

    const models = await modelNames(response);

    return models === undefined ? { ok: false, message: "모델 목록을 읽을 수 없습니다. 주소를 확인하세요." } : { ok: true, models };
  } catch (error) {
    return { ok: false, message: connectionErrorText(error instanceof Error ? error : String(error)) };
  }
}

export type ConnectionResult = { ok: true; ms: number } | { ok: false; message: string };

const TEST_PROMPT: Prompt = { system: "연결 확인 요청이다. 한 단어로 답하라.", user: "확인", schema: replySchema([]) };

/** Sends one tiny real request, so a wrong address, key or model name all show up. */
export async function testConnection(settings: LlmSettings): Promise<ConnectionResult> {
  const missing = missingSetting(settings);

  if (missing !== undefined) {
    return { ok: false, message: missing };
  }

  const started = performance.now();

  try {
    const reply = await complete(settings, TEST_PROMPT);

    return reply.trim() === ""
      ? { ok: false, message: "서버가 빈 응답을 보냈습니다. 모델 이름을 확인하세요." }
      : { ok: true, ms: performance.now() - started };
  } catch (error) {
    return { ok: false, message: connectionErrorText(error instanceof Error ? error : String(error)) };
  }
}
