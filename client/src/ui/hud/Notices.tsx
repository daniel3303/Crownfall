import { session } from "../../session";
import { useHud } from "../store";

export function Notices() {
  const notices = useHud((s) => s.notices);
  const now = performance.now();
  return (
    <div className="notices">
      {notices
        .filter((n) => now - n.at < 5000)
        .map((notice) => (
          <div
            key={notice.id}
            className={`notice notice-${notice.tone} ${notice.x !== undefined ? "clickable" : ""}`}
            onClick={() => notice.x !== undefined && session.game?.jumpTo(notice.x, notice.y!)}
          >
            {notice.text}
          </div>
        ))}
    </div>
  );
}
