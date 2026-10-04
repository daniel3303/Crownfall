import type { Difficulty } from "../../net/protocol";
import { LADDER, ladderRank, nextRung } from "../../meta/ladder";
import { MetaIcon } from "./MetaIcon";
import { useMeta } from "./meta-store";

/** One rank per bot difficulty beaten; the lowest unbeaten rung is highlighted with a button to fight it. */
export function BotLadder({ onFight }: { onFight(difficulty: Difficulty): void }) {
  const beaten = useMeta((v) => v.meta.beaten);
  const rank = ladderRank(beaten);
  const next = nextRung(beaten);
  return (
    <div className="ladder">
      <p className="hint">
        {rank ? `Your rank: ${rank.rank}.` : "No rank yet."} {next ? `Next rung: beat ${next.foe} bot to become ${next.rank}.` : "Every rung beaten."}
      </p>
      <ol className="ladder-rungs">
        {[...LADDER].reverse().map((rung) => {
          const won = beaten.includes(rung.difficulty);
          const isNext = next?.difficulty === rung.difficulty;
          return (
            <li key={rung.difficulty} className={`rung ${won ? "won" : ""} ${isNext ? "next" : ""}`}>
              <span className="rung-icon">
                <MetaIcon id={won ? "medal" : "shield"} />
              </span>
              <span className="rung-name">
                <strong>{rung.rank}</strong>
                <small>
                  Beat {rung.foe} bot · first win +{rung.xp} XP
                </small>
              </span>
              {won ? (
                <small className="rung-state">Beaten</small>
              ) : (
                <button className={`btn btn-small ${isNext ? "btn-primary" : ""}`} onClick={() => onFight(rung.difficulty)}>
                  Fight
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
