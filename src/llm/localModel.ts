// First-run model download, driven from settings. Rust owns the URL, hash and file; this keeps
// the progress in one place so it survives the settings dialog closing and reopening.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as v from "valibot";

export const MODEL_NAME = "Qwen3 4B (Q4_K_M)";

const StatusSchema = v.object({
  dir: v.string(),
  size: v.nullable(v.number()),
  partial: v.number(),
  total: v.number(),
  downloading: v.boolean(),
});

export type ModelStatus = v.InferOutput<typeof StatusSchema>;

const ProgressSchema = v.object({ received: v.number(), total: v.number() });

export type DownloadState = {
  phase: "idle" | "downloading" | "verifying";
  received: number;
  error: string | undefined;
};

let state: DownloadState = { phase: "idle", received: 0, error: undefined };

const listeners = new Set<() => void>();

function set(next: DownloadState) {
  state = next;

  for (const listener of listeners) {
    listener();
  }
}

export function subscribeDownload(listener: () => void): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}

export function downloadState(): DownloadState {
  return state;
}

export async function modelStatus(): Promise<ModelStatus> {
  return v.parse(StatusSchema, await invoke("model_status"));
}

function errorText(message: string): string | undefined {
  if (message === "cancelled") {
    return undefined;
  }

  if (message === "hash-mismatch") {
    return "받은 파일이 원본과 달라(SHA256 불일치) 지웠습니다. 다시 받아 주세요.";
  }

  // Anything else after the automatic retries is the connection; the raw text stays for reports.
  return `인터넷 연결이 자꾸 끊겨 멈췄습니다. 받은 만큼은 남아 있으니 이어받기를 눌러 주세요. (${message})`;
}

/** Download or resume. Resolves when finished, paused or failed; the outcome is in downloadState(). */
export async function startDownload(): Promise<void> {
  set({ phase: "downloading", received: state.received, error: undefined });

  const unlisten = await listen("model-download", (event) => {
    const progress = v.safeParse(ProgressSchema, event.payload);

    if (progress.success) {
      const { received, total } = progress.output;

      set({ phase: received >= total ? "verifying" : "downloading", received, error: undefined });
    }
  });

  try {
    await invoke("model_download");
    set({ phase: "idle", received: 0, error: undefined });
  } catch (error) {
    set({ phase: "idle", received: state.received, error: errorText(String(error)) });
  } finally {
    unlisten();
  }
}

export function pauseDownload(): Promise<void> {
  return invoke("model_download_cancel");
}

export function deleteModel(): Promise<void> {
  return invoke("model_delete");
}
