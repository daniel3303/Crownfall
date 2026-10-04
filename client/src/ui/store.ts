import { useSyncExternalStore, type ReactNode } from "react";
import type { EndMessage, LobbyMessage, MatchConfig, PlayerView, StateMessage } from "../net/protocol";
import { queueAnnouncement, type Announcement } from "./hud/announcements";

export type InputMode = { kind: "normal" } | { kind: "place"; building: string } | { kind: "ability"; slot: number } | { kind: "attackMove" };

export interface EntityView {
  id: number;
  defId: string;
  name: string;
  ownerName: string;
  color: string;
  hp: number;
  maxHp: number;
  extra: number;
  flags: number;
  /** Building or hero level, from 1. */
  level: number;
  upgrading: boolean;
  /** Upgrade percent done while upgrading. */
  upgradeProgress: number;
  mine: boolean;
  category: "unit" | "building" | "node";
}

export interface UnitGroup {
  defId: string;
  name: string;
  count: number;
}

export type SelectionView =
  | { kind: "none" }
  | { kind: "units"; groups: UnitGroup[]; total: number; villagers: boolean; single: EntityView | null }
  | { kind: "building"; entity: EntityView; constructing: boolean; trains: string[]; queue: string[]; progress: number }
  | { kind: "other"; entity: EntityView };

export interface Notice {
  id: number;
  text: string;
  tone: string;
  x?: number;
  y?: number;
  at: number;
}

export interface MatchInfo {
  id: string;
  you: number;
  config: MatchConfig;
  players: PlayerView[];
}

export interface HudState {
  screen: "menu" | "connecting" | "lobby" | "game";
  error: string | null;
  lobby: LobbyMessage | null;
  match: MatchInfo | null;
  stats: StateMessage | null;
  selection: SelectionView;
  notices: Notice[];
  mode: InputMode;
  end: EndMessage | null;
  latency: number;
  scoreboard: boolean;
  muted: boolean;
  idleVillagers: number;
  loading: boolean;
  loadError: string | null;
  tip: TipState | null;
  hover: HoverInfo | null;
  /** The hero item shop is open. */
  shop: boolean;
  /** Match-wide banners, the showing one first. */
  announcements: Announcement[];
}

/** A HUD tooltip and the element it explains. */
export interface TipState {
  content: ReactNode;
  anchor: HTMLElement;
}

/** The world entity under the cursor, labelled next to it. */
export interface HoverInfo {
  entity: EntityView;
  x: number;
  y: number;
  /** What a right-click would do there with the current selection. */
  action?: string;
}

const initial: HudState = {
  screen: "menu",
  error: null,
  lobby: null,
  match: null,
  stats: null,
  selection: { kind: "none" },
  notices: [],
  mode: { kind: "normal" },
  end: null,
  latency: 0,
  scoreboard: false,
  muted: false,
  idleVillagers: 0,
  loading: false,
  loadError: null,
  tip: null,
  hover: null,
  shop: false,
  announcements: [],
};

/** How long a toast notice stays on screen. */
export const NOTICE_MS = 5000;

/** A tiny external store so the 60 fps game loop can feed React without re-rendering every frame. */
class HudStore {
  private state: HudState = initial;
  private readonly listeners = new Set<() => void>();
  private noticeSerial = 0;

  get = (): HudState => this.state;

  set(patch: Partial<HudState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  reset(patch: Partial<HudState> = {}): void {
    this.set({ ...initial, muted: this.state.muted, ...patch });
  }

  notify(text: string, tone: string, x?: number, y?: number): void {
    const now = performance.now();
    // A repeated message (a spammed hotkey) refreshes its one toast instead of stacking copies.
    const kept = this.state.notices.filter((n) => now - n.at < NOTICE_MS && n.text !== text);
    const notices = [...kept, { id: ++this.noticeSerial, text, tone, x, y, at: now }].slice(-5);
    this.set({ notices });
    // Nothing else re-renders the toasts when they age out, so the store drops each one once it expires.
    setTimeout(this.expireNotices, NOTICE_MS + 50);
  }

  private expireNotices = (): void => {
    const now = performance.now();
    const notices = this.state.notices.filter((n) => now - n.at < NOTICE_MS);
    if (notices.length !== this.state.notices.length) this.set({ notices });
  };

  announce(next: Omit<Announcement, "id" | "start">): void {
    this.set({ announcements: queueAnnouncement(this.state.announcements, { ...next, id: ++this.noticeSerial }, performance.now()) });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export const store = new HudStore();

export function useHud<T>(select: (state: HudState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.get()));
}
