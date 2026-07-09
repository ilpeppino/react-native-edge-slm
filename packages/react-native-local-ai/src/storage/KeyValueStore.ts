/**
 * KeyValueStore — a tiny persistent string KV boundary used by {@link ModelRegistry}.
 *
 * On-device back this with AsyncStorage / MMKV. In tests, an in-memory Map is enough.
 */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** In-memory implementation — the default when no persistent store is provided (and for tests). */
export class InMemoryKeyValueStore implements KeyValueStore {
  private readonly map = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.map.delete(key);
  }
}
