/** Writes the browser refused this visit, so progress still shows when localStorage is blocked or full. */
const unsaved = new Map<string, string>();

/** Reads a JSON value; null when absent, unreadable or blocked. */
export function readJson<T>(key: string): T | null {
  // Only refused writes are held here, so working storage is always read fresh and another tab's save is never shadowed.
  const raw = unsaved.get(key) ?? readStorage(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt entry reads as absent, so the caller starts fresh.
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  try {
    localStorage.setItem(key, raw);
    unsaved.delete(key);
  } catch {
    // Storage can be blocked or full; the in-memory copy keeps this visit consistent.
    unsaved.set(key, raw);
  }
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // Blocked storage (or none, as under tests) reads as empty.
    return null;
  }
}
