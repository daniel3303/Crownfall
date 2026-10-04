import { useEffect, useState } from "react";
import { dailyChallenges, dailyFor, dateKey } from "../../meta/challenges";
import { metaStore, useMeta } from "./meta-store";

/** Today's three challenges with progress bars and the time left until they turn over at local midnight. */
export function DailyChallenges() {
  const daily = useMeta((v) => v.meta.daily);
  const now = useMinuteClock();
  const today = dailyFor(daily, dateKey(now));
  useEffect(() => {
    if (daily.date !== today.date) metaStore.refresh();
  }, [daily.date, today.date]);
  return (
    <div className="daily">
      <ul className="daily-list">
        {dailyChallenges(today.date).map((def) => {
          const done = Math.min(def.goal, today.progress[def.id] ?? 0);
          const complete = done >= def.goal;
          return (
            <li key={def.id} className={complete ? "complete" : ""}>
              <div className="daily-text">
                <span>{def.text}</span>
                <small>{complete ? "Done" : `+${def.xp} XP`}</small>
              </div>
              <div className="meta-bar" role="progressbar" aria-label={def.text} aria-valuemin={0} aria-valuemax={def.goal} aria-valuenow={done}>
                <span style={{ width: `${(done / def.goal) * 100}%` }} />
              </div>
              <small className="hint">
                {done.toLocaleString()} / {def.goal.toLocaleString()}
              </small>
            </li>
          );
        })}
      </ul>
      <p className="hint">New challenges in {untilMidnight(now)}.</p>
    </div>
  );
}

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function untilMidnight(now: Date): string {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const minutes = Math.max(1, Math.ceil((midnight.getTime() - now.getTime()) / 60_000));
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
