// When the bundled llama-server runs: started on demand, warmed up when the quick-add input is
// focused, stopped after an idle period. Rust only spawns and kills the process.
import { invoke, isTauri } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import * as v from "valibot";
import { readStored, writeStored } from "../storage/localStore";

/** Outside Tauri (browser preview, benches): a server started by hand on this port, without a key. */
export const LOCAL_ORIGIN = "http://127.0.0.1:8357";

/** Where the app's server listens and the key it takes; new on every start. */
export type Connection = { origin: string; key: string };

export const MANUAL_SERVER: Connection = { origin: LOCAL_ORIGIN, key: "" };

export type LocalStatus = "off" | "starting" | "ready" | "error" | "no-model";

/** "ready" = ours and answering with auth; "starting" = alive, still loading; "dead" = already exited. */
export type ServerHealth = "ready" | "starting" | "dead";

/** Process and clock seams; the app passes Tauri and window timers, tests pass fakes. */
export type ServerControl = {
  /** Starts the process unless it runs; "no-model" when the model file is missing. */
  start: (cpuOnly?: boolean) => Promise<Connection | "no-model">;
  stop: () => Promise<void>;
  /** Whether our process is ready, still loading, or already exited. */
  health: (connection: Connection) => Promise<ServerHealth>;
  wait: (ms: number) => Promise<void>;
  /** Runs `run` after `ms`; returns a cancel function. */
  setTimer: (run: () => void, ms: number) => () => void;
};

export type ServerOptions = { idleMs: number; readyTimeoutMs: number; pollMs: number };

export type LocalServer = {
  status: () => LocalStatus;
  subscribe: (listener: () => void) => () => void;
  /** Resolves once the server is ready, with where to reach it. Restarts the idle countdown. */
  ensure: () => Promise<Connection>;
  /** Start in the background and, if it was not running, send one warm-up request. */
  prestart: (warmUp: (connection: Connection, canSave: () => boolean) => Promise<void>) => void;
  stop: () => Promise<void>;
};

export const SERVER_DEFAULTS: ServerOptions = { idleMs: 10 * 60_000, readyTimeoutMs: 60_000, pollMs: 250 };

const WARMUP_TIMEOUT_MS = 30_000;

const SLOT_HASH_PREFIX = "malplan.slotHash.";

const noop = () => {};

export function createLocalServer(control: ServerControl, options: ServerOptions): LocalServer {
  let status: LocalStatus = "off";
  let pending: Promise<Connection> | undefined;
  let cancelIdle = noop;
  /** Bumped by stop(): a start still in progress gives up instead of making the next ensure() wait for it. */
  let generation = 0;
  /** Bumped by real requests (ensure), so an overlapping warm-up does not save a user sentence to extract.bin. */
  let requests = 0;
  /** Set once Vulkan exits before becoming healthy so later restarts go straight to CPU (--device none). */
  let forceCpu = false;

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

  const bringUp = async (run: number): Promise<Connection> => {
    const stopped = async () => {
      if (generation === run) {
        return false;
      }

      // stop() may have run before the process was spawned: make sure it is gone.
      await control.stop().catch(() => undefined);

      return true;
    };

    const startOnce = async (cpuOnly: boolean): Promise<Connection | "dead"> => {
      // A real start error after "no-model" (the model was installed since) must show, not the old "no-model".
      const started = await control.start(cpuOnly).catch((error: Error) => {
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
        const state = await control.health(started);

        if (await stopped()) {
          throw new Error("로컬 AI 서버를 중지했습니다.");
        }

        if (state === "ready") {
          set("ready");

          return started;
        }

        if (state === "dead") {
          return "dead";
        }

        set("starting");
        await control.wait(options.pollMs);
      }

      // A process that never answered would otherwise run until the app exits.
      await control.stop().catch(() => undefined);
      set("error");

      throw new Error("로컬 AI 서버가 응답하지 않습니다.");
    };

    const first = await startOnce(forceCpu);

    if (first !== "dead") {
      return first;
    }

    // Vulkan startup may crash on older drivers; retry once on CPU (--device none) instead of hanging or failing.
    if (!forceCpu) {
      if (await stopped()) {
        throw new Error("로컬 AI 서버를 중지했습니다.");
      }

      set("starting");

      const fallback = await startOnce(true);

      if (fallback !== "dead") {
        forceCpu = true;

        return fallback;
      }
    }

    await control.stop().catch(() => undefined);
    set("error");

    throw new Error("로컬 AI 서버가 시작 중 종료되었습니다.");
  };

  const ready = async () => {
    if (pending === undefined) {
      const run = bringUp(generation).finally(() => {
        if (pending === run) {
          pending = undefined;
        }
      });

      pending = run;
    }

    const connection = await pending;

    cancelIdle();
    cancelIdle = control.setTimer(() => void stop(), options.idleMs);

    return connection;
  };

  const ensure = () => {
    requests += 1;

    return ready();
  };

  return {
    status: () => status,
    subscribe: (listener) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
    ensure,
    prestart: (warmUp) => {
      // Only the caller that initiates a cold start warms up the prompt cache; another focus while still starting
      // shares the in-flight start instead of queueing a second warm-up on the single-slot server.
      const cold = status !== "ready" && pending === undefined;
      const run = generation;
      const before = requests;

      // Failures show up in status(); the real request reports them to the user.
      void ready()
        .then((connection) => (cold ? warmUp(connection, () => generation === run && requests === before) : undefined))
        .catch(() => undefined);
    },
    stop,
  };
}

/** Stable fingerprint of a system prompt so an unchanged restored cache does not rewrite extract.bin on every start. */
export function promptHash(text: string): string {
  let a = 0x811c_9dc5;
  let b = 0x050c_5d1f;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);

    a = Math.imul(a ^ code, 0x0100_0193);
    b = Math.imul(b ^ (code + i), 0x0100_0193);
  }

  return `${text.length}:${(a >>> 0).toString(16)}:${(b >>> 0).toString(16)}`;
}

export type WarmUpFetch = (
  url: string,
  init: { method: "POST"; headers: { "Content-Type": string; Authorization: string }; body: string; signal: AbortSignal },
) => Promise<{ ok: boolean }>;

export type WarmUpIo = {
  fetch: WarmUpFetch;
  readHash: (cacheFile: string) => string | null;
  writeHash: (cacheFile: string, hash: string) => void;
};

const defaultWarmUpIo: WarmUpIo = {
  fetch: (url, init) => tauriFetch(url, init),
  readHash: (cacheFile) => readStored(`${SLOT_HASH_PREFIX}${cacheFile}`),
  writeHash: (cacheFile, hash) => writeStored(`${SLOT_HASH_PREFIX}${cacheFile}`, hash),
};

/**
 * One tiny request with the real system prompt, so llama-server caches its prefix. With `cacheFile`, the cache saved
 * by the last start is loaded first: when it restores cleanly and the prompt is unchanged, nothing is re-evaluated or
 * rewritten. Otherwise the prompt is warmed and saved only if it succeeded and no real request took the slot meanwhile.
 */
export async function warmUpLocal(
  connection: Connection,
  system: string,
  cacheFile?: string | undefined,
  canSave: () => boolean = () => true,
  io: WarmUpIo = defaultWarmUpIo,
): Promise<void> {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${connection.key}` };
  const hash = promptHash(system);

  const slot = (action: "restore" | "save") =>
    io.fetch(`${connection.origin}/slots/0?action=${action}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ filename: cacheFile }),
      signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
    });

  if (cacheFile !== undefined) {
    const restored = await slot("restore");

    if (restored.ok && io.readHash(cacheFile) === hash) {
      return;
    }
  }

  // A real request is already on its way to this single-slot server and will warm the prompt itself.
  if (!canSave()) {
    return;
  }

  const warmed = await io.fetch(`${connection.origin}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "local",
      max_tokens: 1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: "." },
      ],
    }),
    signal: AbortSignal.timeout(WARMUP_TIMEOUT_MS),
  });

  if (cacheFile !== undefined && warmed.ok && canSave()) {
    const saved = await slot("save");

    if (saved.ok) {
      io.writeHash(cacheFile, hash);
    }
  }
}

const StartedSchema = v.object({ port: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)), key: v.pipe(v.string(), v.minLength(32)) });

const tauriControl: ServerControl = {
  start: async (cpuOnly = false) => {
    try {
      const { port, key } = v.parse(StartedSchema, await invoke("llm_start", { cpuOnly }));

      return { origin: `http://127.0.0.1:${port}`, key };
    } catch (error) {
      if (error === "no-model") {
        return "no-model";
      }

      throw new Error(String(error), { cause: error });
    }
  },
  stop: () => invoke("llm_stop"),
  health: async ({ origin }) => {
    try {
      if (!(await invoke<boolean>("llm_running"))) {
        return "dead";
      }

      const signal = AbortSignal.timeout(2000);

      // The process we started still runs (nothing else took its port first), it is up, and it wants the key.
      const ok =
        (await tauriFetch(`${origin}/health`, { signal })).ok &&
        (await tauriFetch(`${origin}/v1/models`, { signal })).status === 401;

      return ok ? "ready" : "starting";
    } catch {
      // Distinguish a server still binding its port from one that exited while we checked /health.
      return (await invoke<boolean>("llm_running").catch(() => false)) ? "starting" : "dead";
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
