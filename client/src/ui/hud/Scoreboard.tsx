import { playerColor, teamColor, TEAM_NAMES } from "../palette";
import { useHud } from "../store";
import { Icon } from "../icons";

export function Scoreboard() {
  const stats = useHud((s) => s.stats);
  const match = useHud((s) => s.match);
  if (!stats || !match) return null;
  const teams = [...new Set(stats.players.map((p) => p.team))].sort();
  return (
    <div className="scoreboard panel">
      {teams.map((team) => (
        <div key={team} className="score-team">
          <h3 style={{ color: teamColor(team) }}>
            {TEAM_NAMES[team]} · {stats.players.filter((p) => p.team === team).reduce((sum, p) => sum + p.score, 0)}
          </h3>
          {stats.players
            .filter((p) => p.team === team)
            .map((p) => (
              <div key={p.index} className={`score-row ${p.defeated ? "defeated" : ""} ${p.index === match.you ? "me" : ""}`}>
                <span style={{ color: playerColor(stats.players, p.index) }}>●</span>
                <span className="seat-name">
                  {p.name}
                  {p.isBot && <> <Icon id="bot" /></>}
                </span>
                <span>{p.score}</span>
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
