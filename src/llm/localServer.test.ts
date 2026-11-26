import { describe, expect, it } from "vitest";
import { createLocalServer, promptHash, warmUpLocal, type Connection, type ServerControl, type ServerHealth, type WarmUpIo } from "./localServer";

const CONNECTION: Connection = { origin: "http://127.0.0.1:50123", key: "k".repeat(64) };

/** A scripted server: ready after `failedPolls` polls; idle timers are held until fired. */
type Fake = { control: ServerControl; calls: string[]; fireIdle: () => void; pendingTimers: () => number };

function fake(startResult: "started" | "no-model", failedPolls: number): Fake {
  const calls: string[] = [];
  const timers = new Set<() => void>();
  let polls = 0;

  const control: ServerControl = {
    start: async (cpuOnly) => {
      calls.push(cpuOnly === true ? "start-cpu" : "start");

      return startResult === "started" ? CONNECTION : "no-model";
    },
    stop: async () => {
      calls.push("stop");
    },
    health: async () => {
      polls += 1;

      return polls > failedPolls ? "ready" : "starting";
    },
    wait: async (ms) => {
      calls.push(`wait ${ms}`);
    },
    setTimer: (run) => {
      timers.add(run);

      return () => timers.delete(run);
    },
  };

  return {
    control,
    calls,
    fireIdle: () => {
      for (const run of timers) {
        timers.delete(run);
        run();
      }
    },
    pendingTimers: () => timers.size,
  };
}

/** Nothing to release yet. */
const settled = async () => {};

const OPTIONS = { idleMs: 600_000, readyTimeoutMs: 1000, pollMs: 250 };

describe("createLocalServer", () => {
  it("starts, polls /health until ready, then counts down to idle stop", async () => {
    const f = fake("started", 2);
    const server = createLocalServer(f.control, OPTIONS);
    const seen: string[] = [];

    server.subscribe(() => seen.push(server.status()));
    await server.ensure();

    expect(f.calls).toEqual(["start", "wait 250", "wait 250"]);
    expect(seen).toEqual(["starting", "ready"]);
    expect(f.pendingTimers()).toBe(1);

    f.fireIdle();
    await Promise.resolve();

    expect(f.calls.at(-1)).toBe("stop");
    expect(server.status()).toBe("off");
  });

  it("shares one start between concurrent requests and keeps one idle timer", async () => {
    const f = fake("started", 1);
    const server = createLocalServer(f.control, OPTIONS);

    await Promise.all([server.ensure(), server.ensure()]);
    await server.ensure();

    expect(f.calls.filter((c) => c === "start")).toHaveLength(2);
    expect(f.pendingTimers()).toBe(1);
  });

  it("reports a missing model without polling", async () => {
    const f = fake("no-model", 0);
    const server = createLocalServer(f.control, OPTIONS);

    await expect(server.ensure()).rejects.toThrow("모델");
    expect(server.status()).toBe("no-model");
    expect(f.calls).toEqual(["start"]);
  });

  it("gives up after the ready timeout", async () => {
    const f = fake("started", 1000);
    const server = createLocalServer(f.control, OPTIONS);

    await expect(server.ensure()).rejects.toThrow("응답");
    expect(server.status()).toBe("error");
    expect(f.calls.filter((c) => c.startsWith("wait"))).toHaveLength(5);
    expect(f.calls.at(-1)).toBe("stop");
    expect(f.pendingTimers()).toBe(0);
  });

  it("warms up only when the server was not already ready", async () => {
    const f = fake("started", 0);
    const server = createLocalServer(f.control, OPTIONS);
    let warmUps = 0;

    const warmUp = async () => {
      warmUps += 1;
    };

    server.prestart(warmUp);
    await new Promise((resolve) => setTimeout(resolve, 0));
    server.prestart(warmUp);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warmUps).toBe(1);
    expect(server.status()).toBe("ready");
  });

  it("runs only one warm-up when prestart is called again while starting", async () => {
    const f = fake("started", 1000);
    let readyNow = false;
    let release = settled;

    const server = createLocalServer(
      {
        ...f.control,
        health: async () => (readyNow ? "ready" : "starting"),
        wait: () => new Promise<void>((resolve) => (release = () => Promise.resolve(resolve()))),
      },
      OPTIONS,
    );

    let warmUps = 0;

    const warmUp = async () => {
      warmUps += 1;
    };

    server.prestart(warmUp);
    await Promise.resolve();
    server.prestart(warmUp);

    readyNow = true;
    await release();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warmUps).toBe(1);
    expect(server.status()).toBe("ready");
  });

  it("marks canSave false once a real request arrives during warm-up", async () => {
    const f = fake("started", 0);
    const server = createLocalServer(f.control, OPTIONS);
    let savedAllowed: (() => boolean) | undefined;

    server.prestart(async (_connection, canSave) => {
      savedAllowed = canSave;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(savedAllowed?.()).toBe(true);

    await server.ensure();
    expect(savedAllowed?.()).toBe(false);
  });

  it("falls back to CPU once when the GPU launch exits before becoming ready", async () => {
    const f = fake("started", 0);
    let cpuMode = false;

    const server = createLocalServer(
      {
        ...f.control,
        start: async (cpuOnly) => {
          cpuMode = cpuOnly === true;

          return f.control.start(cpuOnly);
        },
        health: async () => (cpuMode ? "ready" : "dead"),
      },
      OPTIONS,
    );

    await server.ensure();
    expect(f.calls).toEqual(["start", "start-cpu"]);
    expect(server.status()).toBe("ready");

    // Remembers CPU mode for the rest of the session so later restarts do not crash Vulkan again.
    await server.stop();
    await server.ensure();
    expect(f.calls).toEqual(["start", "start-cpu", "stop", "start-cpu"]);
  });

  it("fails immediately without polling when both GPU and CPU launches exit early", async () => {
    const f = fake("started", 0);
    const server = createLocalServer({ ...f.control, health: async () => "dead" }, OPTIONS);

    await expect(server.ensure()).rejects.toThrow("종료");
    expect(server.status()).toBe("error");
    expect(f.calls).toEqual(["start", "start-cpu", "stop"]);
  });

  it("a start error after no-model shows as an error", async () => {
    let installed = false;
    const f = fake("no-model", 0);

    const server = createLocalServer(
      {
        ...f.control,
        start: async () => {
          if (installed) {
            throw new Error("port in use");
          }

          return "no-model";
        },
      },
      OPTIONS,
    );

    await expect(server.ensure()).rejects.toThrow("모델");
    expect(server.status()).toBe("no-model");

    installed = true;
    await expect(server.ensure()).rejects.toThrow("port in use");
    expect(server.status()).toBe("error");
  });

  it("stop() during startup ends that start; the next ensure() starts afresh", async () => {
    const f = fake("started", 1000);
    let healthyNow = false;
    /** Ends the wait the start is in. */
    let release = settled;

    const server = createLocalServer(
      {
        ...f.control,
        health: async () => (healthyNow ? "ready" : "starting"),
        wait: () => new Promise<void>((resolve) => (release = () => Promise.resolve(resolve()))),
      },
      OPTIONS,
    );

    const first = server.ensure();

    await Promise.resolve();
    await server.stop();
    await release();
    await expect(first).rejects.toThrow("중지");
    expect(server.status()).toBe("off");

    healthyNow = true;
    await server.ensure();
    expect(server.status()).toBe("ready");
  });

  it("hands out the connection it started with, to requests and the warm-up", async () => {
    const f = fake("started", 0);
    const checked: Connection[] = [];

    const server = createLocalServer(
      {
        ...f.control,
        health: async (connection) => {
          checked.push(connection);

          return "ready";
        },
      },
      OPTIONS,
    );

    const warmed: Connection[] = [];

    expect(await server.ensure()).toEqual(CONNECTION);
    await server.stop();
    server.prestart(async (connection) => {
      warmed.push(connection);
    });
    await server.ensure();
    await Promise.resolve();

    expect(checked.every((connection) => connection === CONNECTION)).toBe(true);
    expect(warmed).toEqual([CONNECTION]);
  });

  it("a server that does not answer as ours never becomes ready", async () => {
    const f = fake("started", 0);
    const server = createLocalServer({ ...f.control, health: async (): Promise<ServerHealth> => "starting" }, OPTIONS);

    await expect(server.ensure()).rejects.toThrow("응답");
    expect(server.status()).toBe("error");
  });
});

type FakeWarmUp = { io: WarmUpIo; paths: string[]; hash: () => string | null };

function fakeWarmUpIo(responses: Record<string, boolean>, initialHash: string | null = null): FakeWarmUp {
  const paths: string[] = [];
  let stored = initialHash;

  const io: WarmUpIo = {
    fetch: async (url) => {
      const path = url.slice(CONNECTION.origin.length);

      paths.push(path);

      return { ok: responses[path] ?? true };
    },
    readHash: () => stored,
    writeHash: (_file, value) => {
      stored = value;
    },
  };

  return { io, paths, hash: () => stored };
}

describe("warmUpLocal", () => {
  it("skips re-warming and saving when restore succeeds and the system prompt is unchanged", async () => {
    const system = "system prompt v1";
    const f = fakeWarmUpIo({ "/slots/0?action=restore": true }, promptHash(system));

    await warmUpLocal(CONNECTION, system, "extract.bin", () => true, f.io);

    expect(f.paths).toEqual(["/slots/0?action=restore"]);
  });

  it("warms and saves when the prompt changed or restore failed", async () => {
    const system = "system prompt v2";
    const f = fakeWarmUpIo({ "/slots/0?action=restore": false, "/v1/chat/completions": true, "/slots/0?action=save": true });

    await warmUpLocal(CONNECTION, system, "extract.bin", () => true, f.io);

    expect(f.paths).toEqual(["/slots/0?action=restore", "/v1/chat/completions", "/slots/0?action=save"]);
    expect(f.hash()).toBe(promptHash(system));
  });

  it("does not overwrite extract.bin when the warm-up completion fails", async () => {
    const f = fakeWarmUpIo({ "/slots/0?action=restore": false, "/v1/chat/completions": false }, "old");

    await warmUpLocal(CONNECTION, "system prompt", "extract.bin", () => true, f.io);

    expect(f.paths).toEqual(["/slots/0?action=restore", "/v1/chat/completions"]);
    expect(f.hash()).toBe("old");
  });

  it("does not save extract.bin if a real request took the slot during warm-up", async () => {
    let allowSave = true;
    const paths: string[] = [];
    let savedHash: string | null = null;

    const io: WarmUpIo = {
      fetch: async (url) => {
        const path = url.slice(CONNECTION.origin.length);

        paths.push(path);

        if (path === "/v1/chat/completions") {
          allowSave = false;
        }

        return { ok: path !== "/slots/0?action=restore" };
      },
      readHash: () => savedHash,
      writeHash: (_file, value) => {
        savedHash = value;
      },
    };

    await warmUpLocal(CONNECTION, "system prompt", "extract.bin", () => allowSave, io);

    expect(paths).toEqual(["/slots/0?action=restore", "/v1/chat/completions"]);
    expect(savedHash).toBeNull();
  });
});
