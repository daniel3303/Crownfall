import type { MatchConfig, MatchSummary } from "./protocol";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (response.status === 503) throw new Error("The server is full right now. Try again in a minute.");
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return (await response.json()) as T;
}

export const api = {
  quickPlay: () => request<MatchSummary>("/api/matches/quickplay", { method: "POST" }),
  create: (config: Partial<MatchConfig>) => request<MatchSummary>("/api/matches", { method: "POST", body: JSON.stringify(config) }),
  list: () => request<MatchSummary[]>("/api/matches"),
  get: (id: string) => request<MatchSummary>(`/api/matches/${encodeURIComponent(id)}`),
};
