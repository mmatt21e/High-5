/** Coalesces concurrent work for the same key into one shared promise. */
export class SingleFlight<K, V> {
  private readonly inFlight = new Map<K, Promise<V>>();

  run(key: K, work: () => Promise<V>): Promise<V> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const pending = Promise.resolve().then(work);
    this.inFlight.set(key, pending);
    const clear = () => {
      if (this.inFlight.get(key) === pending) this.inFlight.delete(key);
    };
    void pending.then(clear, clear);
    return pending;
  }
}

/**
 * Serializes mutations per key while allowing unrelated keys to proceed in
 * parallel. A rejected operation releases the queue for the next operation.
 * Capacity limits prevent callers from retaining an unbounded promise chain.
 */
export class QueueCapacityExceededError extends Error {
  constructor(readonly reason: "key-capacity" | "key-count") {
    super("The operation queue is at capacity");
    this.name = "QueueCapacityExceededError";
  }
}

export interface KeyedSerialQueueOptions {
  /** Active plus waiting operations accepted for one key. */
  maxPendingPerKey?: number;
  /** Keys that may have active or waiting work at the same time. */
  maxActiveKeys?: number;
}

export class KeyedSerialQueue<K> {
  private readonly tails = new Map<K, Promise<void>>();
  private readonly pending = new Map<K, number>();
  private readonly maxPendingPerKey: number;
  private readonly maxActiveKeys: number;

  constructor(options: KeyedSerialQueueOptions = {}) {
    this.maxPendingPerKey = options.maxPendingPerKey ?? 32;
    this.maxActiveKeys = options.maxActiveKeys ?? 10_000;
    if (
      !Number.isSafeInteger(this.maxPendingPerKey) ||
      this.maxPendingPerKey < 1 ||
      !Number.isSafeInteger(this.maxActiveKeys) ||
      this.maxActiveKeys < 1
    ) {
      throw new Error("Invalid queue capacity");
    }
  }

  async run<T>(key: K, work: () => Promise<T>): Promise<T> {
    const pendingForKey = this.pending.get(key) ?? 0;
    if (pendingForKey >= this.maxPendingPerKey) {
      throw new QueueCapacityExceededError("key-capacity");
    }
    if (pendingForKey === 0 && this.pending.size >= this.maxActiveKeys) {
      throw new QueueCapacityExceededError("key-count");
    }
    this.pending.set(key, pendingForKey + 1);

    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => gate);
    this.tails.set(key, tail);

    await previous.catch(() => undefined);
    try {
      return await work();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
      const remaining = (this.pending.get(key) ?? 1) - 1;
      if (remaining === 0) this.pending.delete(key);
      else this.pending.set(key, remaining);
    }
  }
}
