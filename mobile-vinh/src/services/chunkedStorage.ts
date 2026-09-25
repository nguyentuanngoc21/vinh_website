type Storage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
type Manifest = { generation: string; count: number };

// Supabase sessions can exceed SecureStore's 2048-byte warning threshold.
// 400 code points fit within 1600 UTF-8 bytes, without splitting surrogate pairs.
export function createChunkedStorage(storage: Storage): Storage {
  let pending: Promise<unknown> = Promise.resolve();
  function run<T>(operation: () => Promise<T>): Promise<T> {
    const result = pending.then(operation);
    pending = result.catch(() => undefined);
    return result;
  }
  async function manifest(key: string): Promise<Manifest | null> {
    const raw = await storage.getItem(`${key}.manifest`);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value.generation !== 'string' || !Number.isInteger(value.count) || value.count < 1 || value.count > 1000) throw new Error('Invalid secure storage manifest');
    return value;
  }
  async function clean(key: string, entry: Manifest | null) {
    if (entry) await Promise.all(Array.from({ length: entry.count }, (_, i) => storage.removeItem(`${key}.${entry.generation}.${i}`)));
  }
  return {
    getItem: key => run(async () => {
      const entry = await manifest(key);
      if (!entry) return storage.getItem(key); // Previous single-item format.
      const parts = await Promise.all(Array.from({ length: entry.count }, (_, i) => storage.getItem(`${key}.${entry.generation}.${i}`)));
      if (parts.some(part => part === null)) throw new Error('Incomplete secure session');
      return parts.join('');
    }),
    setItem: (key, value) => run(async () => {
      const previous = await manifest(key);
      const characters = Array.from(value);
      const entry = { generation: `${Date.now()}-${Math.random().toString(36).slice(2)}`, count: Math.max(1, Math.ceil(characters.length / 400)) };
      if (entry.count > 1000) throw new Error('Secure session too large');
      try {
        for (let i = 0; i < entry.count; i++) await storage.setItem(`${key}.${entry.generation}.${i}`, characters.slice(i * 400, (i + 1) * 400).join(''));
        // Publish the pointer only after all chunks are durable.
        await storage.setItem(`${key}.manifest`, JSON.stringify(entry));
      } catch (error) {
        await clean(key, entry).catch(() => undefined);
        throw error;
      }
      await storage.removeItem(key);
      await clean(key, previous);
    }),
    removeItem: key => run(async () => {
      const previous = await manifest(key);
      await clean(key, previous);
      await storage.removeItem(key);
      await storage.removeItem(`${key}.manifest`);
    }),
  };
}
