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
 */
export class KeyedSerialQueue<K> {
  private readonly tails = new Map<K, Promise<void>>();

  async run<T>(key: K, work: () => Promise<T>): Promise<T> {
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
    }
  }
}
