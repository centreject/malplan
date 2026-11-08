// When the bundled llama-server runs: started on demand, warmed up when the quick-add input is
// focused, stopped after an idle period. Rust only spawns and kills the process.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

/** Must match PORT in src-tauri/src/llm_server.rs. */
export const LOCAL_ORIGIN = "http://127.0.0.1:8357";

export type LocalStatus = "off" | "starting" | "ready" | "error" | "no-model";

/** Process and clock seams; the app passes Tauri and window timers, tests pass fakes. */
export type ServerControl = {
  /** Starts the process unless it runs; "no-model" when the model file is missing. */
  start: () => Promise<"started" | "no-model">;
  stop: () => Promise<void>;
  healthy: () => Promise<boolean>;
  wait: (ms: number) => Promise<void>;
  /** Runs `run` after `ms`; returns a cancel function. */
  setTimer: (run: () => void, ms: number) => () => void;
};

export type ServerOptions = { idleMs: number; readyTimeoutMs: number; pollMs: number };

export type LocalServer = {
  status: () => LocalStatus;
  subscribe: (listener: () => void) => () => void;
  /** Resolves once the server answers /health. Restarts the idle countdown. */
  ensure: () => Promise<void>;
  /** Start in the background and, if it was not running, send one warm-up request. */
  prestart: (warmUp: () => Promise<void>) => void;
  stop: () => Promise<void>;
};

export const SERVER_DEFAULTS: ServerOptions = { idleMs: 10 * 60_000, readyTimeoutMs: 60_000, pollMs: 250 };

const noop = () => {};

export function createLocalServer(control: ServerControl, options: ServerOptions): LocalServer {
  let status: LocalStatus = "off";
  let pending: Promise<void> | undefined;
  let cancelIdle = noop;
  /** Bumped by stop(): a start still in progress gives up instead of making the next ensure() wait for it. */
  let generation = 0;

  const listeners = new Set<() => void>();

  const set = (next: LocalStatus) => {
    if (next !== status) {
      status = next;

      for (const listener of listeners) {
        listener();
      }
    }
  };

  const stop = async () => {
    generation += 1;
    pending = undefined;
    cancelIdle();
    await control.stop();
    set("off");
  };

  const bringUp = async (run: number) => {
    const stopped = async () => {
      if (generation === run) {
        return false;
      }

      // stop() may have run before the process was spawned: make sure it is gone.
      await control.stop().catch(() => undefined);

      return true;
    };

    // A real start error after "no-model" (the model was installed since) must show, not the old "no-model".
    const started = await control.start().catch((error: Error) => {
      set("error");

      throw error;
    });

    if (await stopped()) {
      throw new Error("로컬 AI 서버를 중지했습니다.");
    }

    if (started === "no-model") {
      set("no-model");

      throw new Error("로컬 AI 모델이 없습니다.");
    }

    for (let waited = 0; waited <= options.readyTimeoutMs; waited += options.pollMs) {
      const healthy = await control.healthy();

      if (await stopped()) {
        throw new Error("로컬 AI 서버를 중지했습니다.");
      }

      if (healthy) {
        set("ready");

        return;
      }

      set("starting");
      await control.wait(options.pollMs);
    }

    // A process that never answered would otherwise run until the app exits.
    await control.stop().catch(() => undefined);
    set("error");

    throw new Error("로컬 AI 서버가 응답하지 않습니다.");
  };

  const ensure = async () => {
    if (pending === undefined) {
      const run = bringUp(generation).finally(() => {
        if (pending === run) {
          pending = undefined;
        }
      });

      pending = run;
    }

    await pending;
    cancelIdle();
    cancelIdle = control.setTimer(() => void stop(), options.idleMs);
  };

  return {
    status: () => status,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    ensure,
    prestart: (warmUp) => {
      const cold = status !== "ready";

      // Failures show up in status(); the real request reports them to the user.
      void ensure()
        .then(() => (cold ? warmUp() : undefined))
        .catch(() => undefined);
    },
    stop,
  };
}

/** One tiny request with the real system prompt, so llama-server caches its prefix. */
export async function warmUpLocal(system: string): Promise<void> {
  await tauriFetch(`${LOCAL_ORIGIN}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "local",
      max_tokens: 1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: "." },
      ],
    }),
  });
}

const tauriControl: ServerControl = {
  start: async () => {
    try {
      await invoke("llm_start");

      return "started";
    } catch (error) {
      if (error === "no-model") {
        return "no-model";
      }

      throw new Error(String(error), { cause: error });
    }
  },
  stop: () => invoke("llm_stop"),
  healthy: async () => {
    try {
      return (await tauriFetch(`${LOCAL_ORIGIN}/health`, { signal: AbortSignal.timeout(2000) })).ok;
    } catch {
      return false;
    }
  },
  wait: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
  setTimer: (run, ms) => {
    const id = window.setTimeout(run, ms);

    return () => window.clearTimeout(id);
  },
};

/** The app's server. Outside Tauri (browser preview, benches) a manually started server is used. */
export const localServer: LocalServer | undefined = isTauri() ? createLocalServer(tauriControl, SERVER_DEFAULTS) : undefined;
