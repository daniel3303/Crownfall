import type { EndMessage } from "../net/protocol";
import { session } from "../session";
import { playerColor, TEAM_NAMES } from "./palette";
import { useHud } from "./store";
import { Icon } from "./icons";

export function EndScreen({ end }: { end: EndMessage }) {
  const match = useHud((s) => s.match);
  const myTeam = end.players.find((p) => p.index === match?.you)?.team ?? -1;
  const draw = end.winningTeam < 0;
  const won = !draw && end.winningTeam === myTeam;
  const players = [...end.players].sort((a, b) => b.score - a.score);
  const roster = match?.players ?? [];
  return (
    <div className="end-screen">
      <div className="panel end-card">
        <h1 className={won ? "victory" : draw ? "" : "defeat"}>{draw ? "Stalemate" : won ? "Victory!" : "Defeat"}</h1>
        {!draw && <p>{TEAM_NAMES[end.winningTeam]} holds the crown.</p>}
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Score</th>
              <th>Gathered</th>
              <th>Kills</th>
              <th>Losses</th>
              <th>Trained</th>
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
                <td>Lv {p.heroLevel}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn btn-primary btn-big" onClick={() => session.leave()}>
          Back to the war table
        </button>
      </div>
    </div>
  );
}
