import { useSyncExternalStore } from "react";
import type { EndMessage } from "../../net/protocol";
import { outcomeFrom } from "../../meta/outcome";
import { applyMatch, applyTutorialDone, equip, type MatchReward, type MetaState } from "../../meta/progression";
import type { CosmeticSlot } from "../../meta/unlocks";
import { loadMeta, saveMeta } from "../profile";
import type { MatchInfo } from "../store";

const TOAST_MS = 6000;

export interface Toast {
  id: number;
  kind: "achievement" | "level" | "unlock" | "challenge" | "ladder";
  title: string;
  text: string;
  icon: string;
}

export interface MetaView {
  meta: MetaState;
  /** What the last finished match paid, for its end screen. */
  reward: MatchReward | null;
  toasts: Toast[];
}

/** Profile progression for React: loads lazily, saves on every change and queues the toasts a change earns. */
class MetaStore {
  private state: MetaView | null = null;
  private readonly listeners = new Set<() => void>();
  private toastSerial = 0;

  get = (): MetaView => {
    this.state ??= { meta: loadMeta(), reward: null, toasts: [] };
    return this.state;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Re-reads storage, which also rolls the daily challenges over after midnight. */
  refresh(): void {
    this.set({ meta: loadMeta() });
  }

  /** Pays a finished match into the profile once, keyed by match id. */
  recordEnd(end: EndMessage, match: MatchInfo | null): void {
    if (!match) return;
    const outcome = outcomeFrom(end, match.id, match.you, match.config, match.players);
    const applied = outcome && applyMatch(loadMeta(), outcome, new Date());
    if (!applied) return;
    saveMeta(applied.state);
    this.set({ meta: applied.state, reward: applied.reward });
    this.toastReward(applied.reward);
  }

  completeTutorial(): void {
    const { state, achievements } = applyTutorialDone(loadMeta(), new Date());
    saveMeta(state);
    this.set({ meta: state });
    for (const a of achievements) this.toast("achievement", a.name, a.description, a.icon);
  }

  equip(slot: CosmeticSlot, id: string): void {
    const next = equip(loadMeta(), slot, id);
    saveMeta(next);
    this.set({ meta: next });
  }

  dismiss(id: number): void {
    this.set({ toasts: this.get().toasts.filter((t) => t.id !== id) });
  }

  private toastReward(reward: MatchReward): void {
    for (const a of reward.achievements) this.toast("achievement", a.name, a.description, a.icon);
    if (reward.after.level > reward.before.level) this.toast("level", `Level ${reward.after.level}`, "Your legend grows.", "crown");
    for (const item of reward.unlocked) {
      const text = item.kind === "hero" ? "A new hero to lead; pick it in the menu or the lobby." : `New ${item.kind} for your banner.`;
      this.toast("unlock", `${item.name} unlocked`, text, "sparkles");
    }
    for (const c of reward.challenges.filter((c) => c.completed)) this.toast("challenge", "Daily challenge complete", c.def.text, "calendar");
    if (reward.rung) this.toast("ladder", `${reward.rung.rank} rank earned`, `You beat ${reward.rung.foe} bot.`, "medal");
  }

  private toast(kind: Toast["kind"], title: string, text: string, icon: string): void {
    const toast = { id: ++this.toastSerial, kind, title, text, icon };
    this.set({ toasts: [...this.get().toasts, toast] });
    window.setTimeout(() => this.dismiss(toast.id), TOAST_MS);
  }

  private set(patch: Partial<MetaView>): void {
    this.state = { ...this.get(), ...patch };
    for (const listener of this.listeners) listener();
  }
}

export const metaStore = new MetaStore();

export function useMeta<T>(select: (view: MetaView) => T): T {
  return useSyncExternalStore(metaStore.subscribe, () => select(metaStore.get()));
}
