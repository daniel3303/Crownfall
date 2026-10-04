import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { useHud } from "../store";
import { ANNOUNCEMENT_MS, currentAnnouncement } from "./announcements";

const ICONS: Record<string, string> = { firstBlood: "lifeSteal", killStreak: "attackDamage", shutdown: "armor", dragonSpawned: "dragon", dragonSlain: "dragon" };

/** The big centred banner for first blood, kill streaks, shutdowns and the dragon, one at a time. */
export function Announcer() {
  const queue = useHud((s) => s.announcements);
  const [now, setNow] = useState(() => performance.now());
  // Ticks while banners are queued so each one hands over to the next and the last one clears.
  useEffect(() => {
    const last = queue[queue.length - 1];
    if (!last) return;
    const timer = window.setInterval(() => {
      setNow(performance.now());
      if (performance.now() > last.start + ANNOUNCEMENT_MS) window.clearInterval(timer);
    }, 200);
    return () => window.clearInterval(timer);
  }, [queue]);
  const shown = currentAnnouncement(queue, Math.max(now, performance.now()));
  if (!shown) return null;
  return (
    <div key={shown.id} className={`announcer announce-${shown.type} ${shown.ours ? "ours" : "theirs"}`}>
      <div className="announce-title">
        <Icon id={ICONS[shown.type] ?? "points"} />
        {shown.title}
      </div>
      <div className="announce-text">{shown.text}</div>
    </div>
  );
}
