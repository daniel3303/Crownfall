import { ACHIEVEMENTS } from "../../meta/achievements";
import { MetaIcon } from "./MetaIcon";
import { useMeta } from "./meta-store";

/** Every achievement as a badge: earned ones lit with their date, the rest dimmed with how to earn them. */
export function AchievementGallery() {
  const held = useMeta((v) => v.meta.achievements);
  const earned = ACHIEVEMENTS.filter((a) => held[a.id] !== undefined).length;
  return (
    <div className="achievements">
      <p className="hint">
        {earned} of {ACHIEVEMENTS.length} earned
      </p>
      <ul className="achievement-grid">
        {ACHIEVEMENTS.map((a) => {
          const at = held[a.id];
          return (
            <li key={a.id} className={`achievement ${at !== undefined ? "earned" : ""}`} title={at !== undefined ? `Earned ${new Date(at).toLocaleDateString()}` : `+${a.xp} XP`}>
              <span className="achievement-icon">
                <MetaIcon id={a.icon} />
              </span>
              <span className="achievement-text">
                <strong>{a.name}</strong>
                <small>{a.description}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
