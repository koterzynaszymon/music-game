// How it works: for each key we remember the Promise of the LAST task in line (the "tail"). A new task waits for that tail, then becomes the new tail.
export class KeyedLock {
  private tails = new Map<string, Promise<void>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const done = new Promise<void>((resolve) => (release = resolve));
    const tail = previous.then(() => done);
    this.tails.set(key, tail);

    await previous; // wait for everyone in line before us
    try {
      return await task();
    } finally {
      release(); // let the next task go, even if ours failed
      // Nobody joined the line after us: forget the key, so the Map doesn't
      // keep growing with one entry per room ever played
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
