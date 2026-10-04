import type { EndMessage } from "../net/protocol";
import { session } from "../session";
import { playerColor, TEAM_NAMES } from "./palette";
import { useHud } from "./store";
import { Icon } from "./icons";
import { EndRewards } from "./meta/EndRewards";
import { MatchGraphs } from "./meta/MatchGraphs";
import { useMeta } from "./meta/meta-store";
import { MvpAwards } from "./meta/MvpAwards";

export function EndScreen({ end }: { end: EndMessage }) {
  const match = useHud((s) => s.match);
  const reward = useMeta((v) => v.reward);
  const myTeam = end.players.find((p) => p.index === match?.you)?.team ?? -1;
  const draw = end.winningTeam < 0;
  const won = !draw && end.winningTeam === myTeam;
  const players = [...end.players].sort((a, b) => b.score - a.score);
  const roster = match?.players ?? [];
  const minutes = Math.floor((end.durationSeconds ?? 0) / 60);
  return (
    <div className="end-screen">
      <div className="panel end-card end-rich">
        <h1 className={won ? "victory" : draw ? "" : "defeat"}>{draw ? "Stalemate" : won ? "Victory!" : "Defeat"}</h1>
        {!draw && <p>{TEAM_NAMES[end.winningTeam]} holds the crown.</p>}
        <p className="hint">
          {minutes}:{String((end.durationSeconds ?? 0) % 60).padStart(2, "0")} of battle
        </p>
        {reward && reward.matchId === match?.id && <EndRewards reward={reward} tutorial={match.config.difficulty === "passive"} />}
        <MvpAwards players={end.players} you={match?.you ?? -1} />
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Score</th>
              <th>Gathered</th>
              <th>Kills</th>
              <th>Losses</th>
              <th>Trained</th>
              <th>Heroes slain</th>
              <th>Hero</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.index} className={p.index === match?.you ? "me" : ""}>
                <td style={{ color: playerColor(roster, p.index) }}>
                  {p.name}
                  {p.isBot && <> <Icon id="bot" /></>}
                </td>
                <td>{p.score}</td>
                <td>{p.gathered}</td>
                <td>{p.kills}</td>
                <td>{p.losses}</td>
                <td>{p.unitsTrained}</td>
                <td>{p.heroKills ?? 0}</td>
                <td>Lv {p.heroLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {end.timeline && <MatchGraphs timeline={end.timeline} roster={roster} you={match?.you ?? -1} />}
        <button className="btn btn-primary btn-big" onClick={() => session.leave()}>
          Back to the war table
        </button>
      </div>
    </div>
  );
}
