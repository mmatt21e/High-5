import { describe, expect, it, vi } from "vitest";
import {
  KeyedSerialQueue,
  QueueCapacityExceededError,
  SingleFlight,
} from "../keyedCoordination";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("SingleFlight", () => {
  it("loads a cold key once and shares the post-await object", async () => {
    const flight = new SingleFlight<string, { value: number }>();
    const gate = deferred<{ value: number }>();
    const load = vi.fn(() => gate.promise);

    const first = flight.run("match-1", load);
    const second = flight.run("match-1", load);
    const loaded = { value: 42 };
    gate.resolve(loaded);

    const [a, b] = await Promise.all([first, second]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(a).toBe(loaded);
    expect(b).toBe(loaded);
  });

  it("clears a failed load so the next caller can retry", async () => {
    const flight = new SingleFlight<string, string>();
    let attempts = 0;
    const load = () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("database unavailable"))
        : Promise.resolve("loaded");
    };

    await expect(flight.run("match-1", load)).rejects.toThrow(
      "database unavailable",
    );
    await expect(flight.run("match-1", load)).resolves.toBe("loaded");
    expect(attempts).toBe(2);
  });
});

describe("KeyedSerialQueue", () => {
  it("finishes same-match mutations in call order", async () => {
    const queue = new KeyedSerialQueue<string>();
    const firstGate = deferred<void>();
    const firstStarted = deferred<void>();
    const order: string[] = [];

    const first = queue.run("match-1", async () => {
      order.push("first:start");
      firstStarted.resolve();
      await firstGate.promise;
      order.push("first:end");
    });
    const second = queue.run("match-1", async () => {
      order.push("second:start");
      order.push("second:end");
    });

    await firstStarted.promise;
    expect(order).toEqual(["first:start"]);
    firstGate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("releases a match queue after a failed mutation", async () => {
    const queue = new KeyedSerialQueue<string>();
    const first = queue.run("match-1", async () => {
      throw new Error("write failed");
    });
    const second = queue.run("match-1", async () => "recovered");

    await expect(first).rejects.toThrow("write failed");
    await expect(second).resolves.toBe("recovered");
  });

  it("rejects excess work instead of growing one key without bound", async () => {
    const queue = new KeyedSerialQueue<string>({ maxPendingPerKey: 2 });
    const gate = deferred<void>();
    const started = deferred<void>();
    const first = queue.run("match-1", async () => {
      started.resolve();
      await gate.promise;
    });
    const second = queue.run("match-1", async () => undefined);

    await started.promise;
    await expect(
      queue.run("match-1", async () => undefined),
    ).rejects.toMatchObject({
      name: "QueueCapacityExceededError",
      reason: "key-capacity",
    } satisfies Partial<QueueCapacityExceededError>);

    gate.resolve();
    await Promise.all([first, second]);
    await expect(
      queue.run("match-1", async () => "accepted"),
    ).resolves.toBe("accepted");
  });

  it("bounds the number of simultaneously retained keys", async () => {
    const queue = new KeyedSerialQueue<string>({ maxActiveKeys: 1 });
    const gate = deferred<void>();
    const first = queue.run("match-1", async () => gate.promise);

    await expect(
      queue.run("match-2", async () => undefined),
    ).rejects.toMatchObject({
      name: "QueueCapacityExceededError",
      reason: "key-count",
    } satisfies Partial<QueueCapacityExceededError>);

    gate.resolve();
    await first;
    await expect(
      queue.run("match-2", async () => "accepted"),
    ).resolves.toBe("accepted");
  });

  it("allows simultaneous cold joins to load and start a match only once", async () => {
    const queue = new KeyedSerialQueue<string>();
    const flight = new SingleFlight<string, { started: boolean }>();
    const registry = new Map<string, { started: boolean }>();
    let loads = 0;
    let starts = 0;

    const getLive = () =>
      flight.run("match-1", async () => {
        const cached = registry.get("match-1");
        if (cached) return cached;
        loads += 1;
        await Promise.resolve();
        const loadedDuringRead = registry.get("match-1");
        if (loadedDuringRead) return loadedDuringRead;
        const live = { started: false };
        registry.set("match-1", live);
        return live;
      });
    const join = () =>
      queue.run("match-1", async () => {
        const live = await getLive();
        if (!live.started) {
          live.started = true;
          starts += 1;
        }
      });

    await Promise.all([join(), join()]);
    expect(loads).toBe(1);
    expect(starts).toBe(1);
  });
});
