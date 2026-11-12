import { describe, expect, it } from "vitest";
import { createLocalServer, type Connection, type ServerControl } from "./localServer";

const CONNECTION: Connection = { origin: "http://127.0.0.1:50123", key: "k".repeat(64) };

/** A scripted server: healthy after `failedPolls` polls; idle timers are held until fired. */
type Fake = { control: ServerControl; calls: string[]; fireIdle: () => void; pendingTimers: () => number };

function fake(startResult: "started" | "no-model", failedPolls: number): Fake {
  const calls: string[] = [];
  const timers = new Set<() => void>();
  let polls = 0;

  const control: ServerControl = {
    start: async () => {
      calls.push("start");

      return startResult === "started" ? CONNECTION : "no-model";
    },
    stop: async () => {
      calls.push("stop");
    },
    healthy: async () => {
      polls += 1;

      return polls > failedPolls;
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
        healthy: async () => healthyNow,
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
        healthy: async (connection) => {
          checked.push(connection);

          return true;
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
    const server = createLocalServer({ ...f.control, healthy: async () => false }, OPTIONS);

    await expect(server.ensure()).rejects.toThrow("응답");
    expect(server.status()).toBe("error");
  });
});
