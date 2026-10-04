const urls = new Map<string, string>();
const listeners = new Set<() => void>();

/** A rendered still of a building or resource kind by content id, once the studio has drawn it. */
export function portraitUrl(id: string): string | undefined {
  return urls.get(id);
}

export function onPortraits(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasPortraits(): boolean {
  return urls.size > 0;
}

/** Publishes the studio's stills to every HUD slot waiting on them. */
export function publishPortraits(stills: ReadonlyMap<string, string>): void {
  for (const [id, url] of stills) urls.set(id, url);
  for (const listener of listeners) listener();
}
