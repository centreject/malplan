// Where the extraction prompt is sent. Local (llama-server) is the default; an API key is the
// opt-in alternative. Every provider returns plain text; extract.ts validates it.
import { isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import * as v from "valibot";
import type { Prompt, ReplyJsonSchema } from "./extract";
import { LOCAL_ORIGIN, localServer } from "./localServer";

export const PROVIDERS = [
  { id: "local", name: "로컬 (이 PC에서 처리)" },
  { id: "gemini", name: "Google Gemini API" },
  { id: "anthropic", name: "Claude API" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "off", name: "사용 안 함 (규칙 기반만)" },
] as const;

export type ProviderId = (typeof PROVIDERS)[number]["id"];

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  local: "",
  gemini: "gemini-2.5-flash-lite",
  anthropic: "claude-opus-5-5",
  openrouter: "",
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
});

export type LlmSettings = v.InferOutput<typeof SettingsSchema>;

const STORAGE_KEY = "malplan.llm";

/** Local llama-server's OpenAI-compatible endpoint (started on demand once installed). */
export const LOCAL_ENDPOINT = `${LOCAL_ORIGIN}/v1/chat/completions`;

const TIMEOUT_MS = 30_000;

export function loadLlmSettings(): LlmSettings {
  try {
    const parsed = v.safeParse(SettingsSchema, JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}"));

    return parsed.success ? parsed.output : { provider: "local", apiKey: "", model: "" };
  } catch {
    return { provider: "local", apiKey: "", model: "" };
  }
}

export function saveLlmSettings(settings: LlmSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the setting lasts for this session only.
  }
}

/** The desktop app goes through the Rust HTTP plugin (no CORS); the browser preview uses fetch. */
const httpFetch: typeof window.fetch = (input, init) => (isTauri() ? tauriFetch(input, init) : window.fetch(input, init));

const ChatReply = v.object({
  choices: v.pipe(v.array(v.object({ message: v.object({ content: v.nullable(v.string()) }) })), v.minLength(1)),
});

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

async function openAiCompatible(url: string, apiKey: string, model: string, prompt: Prompt): Promise<string> {
  const headers = new Headers({ "Content-Type": "application/json" });

  if (apiKey !== "") {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  const response = await httpFetch(url, {
    method: "POST",
    headers,
    body: chatBody(url, model, prompt),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const parsed = v.safeParse(ChatReply, await response.json());

  if (!parsed.success) {
    throw new Error("응답 형식을 읽을 수 없습니다.");
  }

  return parsed.output.choices[0]?.message.content ?? "";
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
      return openAiCompatible("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", settings.apiKey, model, prompt);
    case "openrouter":
      if (model === "") {
        throw new Error("OpenRouter 모델 이름을 설정에 입력하세요.");
      }

      return openAiCompatible("https://openrouter.ai/api/v1/chat/completions", settings.apiKey, model, prompt);
    case "anthropic":
      return claude(settings.apiKey, model, prompt);
    case "off":
      throw new Error("AI 변환이 꺼져 있습니다.");
  }
}
