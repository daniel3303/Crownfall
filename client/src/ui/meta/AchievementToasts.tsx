import { MetaIcon } from "./MetaIcon";
import { metaStore, useMeta } from "./meta-store";

/** Unlock toasts over every screen: achievements, level-ups, cosmetics, daily challenges and ladder ranks. */
export function AchievementToasts() {
  const toasts = useMeta((v) => v.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="meta-toasts" aria-live="polite">
      {toasts.map((toast) => (
        <button key={toast.id} className={`meta-toast toast-${toast.kind}`} onClick={() => metaStore.dismiss(toast.id)}>
          <span className="toast-icon">
            <MetaIcon id={toast.icon} />
          </span>
          <span className="toast-text">
            <small>{TOAST_KINDS[toast.kind]}</small>
            <strong>{toast.title}</strong>
            <span>{toast.text}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const TOAST_KINDS: Record<string, string> = {
  achievement: "Achievement unlocked",
  level: "Level up",
  unlock: "New cosmetic",
  challenge: "Daily challenge",
  ladder: "Bot ladder",
};
