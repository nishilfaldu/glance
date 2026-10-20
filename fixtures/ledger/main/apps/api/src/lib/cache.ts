const store = new Map<string, unknown>();

export function cached<T>(key: string, fn: () => T): T {
  if (!store.has(key)) store.set(key, fn());
  return store.get(key) as T;
}
