import { useEffect, useState } from "react";
import type { MatchReward } from "../../meta/progression";
import { MetaIcon } from "./MetaIcon";

/** What the match paid: XP by source, the level bar filling from before to after, unlocks, challenges and achievements. */
export function EndRewards({ reward, tutorial }: { reward: MatchReward; tutorial: boolean }) {
  const levelled = reward.after.level > reward.before.level;
  // The bar starts where the profile stood and fills on the next frame, so the gain is seen to grow.
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  const start = levelled ? 0 : reward.before.progress;
  return (
    <section className="end-rewards">
      <div className="reward-head">
        <strong className="reward-xp">+{reward.xpGained} XP</strong>
        <span>
          Level {reward.after.level}
          {levelled && <em className="level-up"> Level up!</em>}
        </span>
      </div>
      <div className="meta-bar xp-bar">
        <span className="xp-fill" style={{ width: `${(filled ? reward.after.progress : start) * 100}%` }} />
      </div>
      <p className="hint">
        {reward.after.into} / {reward.after.needed} XP to level {reward.after.level + 1}
      </p>
      <ul className="reward-lines">
        {reward.lines.map((line, i) => (
          <li key={i}>
            <span>{line.label}</span>
            <strong>+{line.xp}</strong>
          </li>
        ))}
      </ul>
      {reward.unlocked.length > 0 && (
        <div className="reward-block">
          <h3>Unlocked</h3>
          <ul className="reward-chips">
            {reward.unlocked.map((item) => (
              <li key={item.id}>
                <MetaIcon id="sparkles" /> {item.name} <small>{item.kind}</small>
              </li>
            ))}
          </ul>
        </div>
      )}
      {reward.achievements.length > 0 && (
        <div className="reward-block">
          <h3>Achievements earned</h3>
          <ul className="reward-chips">
            {reward.achievements.map((a) => (
              <li key={a.id} className="earned">
                <MetaIcon id={a.icon} /> {a.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="reward-block">
        <h3>Daily challenges</h3>
        {tutorial && <p className="hint">Tutorial matches do not count toward daily challenges or the ladder.</p>}
        <ul className="daily-list compact">
          {reward.challenges.map((c) => (
            <li key={c.def.id} className={c.after >= c.def.goal ? "complete" : ""}>
              <div className="daily-text">
                <span>{c.def.text}</span>
                <small>
                  {c.completed ? `Complete! +${c.def.xp} XP` : c.after >= c.def.goal ? "Done" : `${c.after.toLocaleString()} / ${c.def.goal.toLocaleString()}`}
                  {!c.completed && c.after > c.before && c.after < c.def.goal && ` (+${(c.after - c.before).toLocaleString()})`}
                </small>
              </div>
              <div className="meta-bar">
                <span style={{ width: `${(c.after / c.def.goal) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
