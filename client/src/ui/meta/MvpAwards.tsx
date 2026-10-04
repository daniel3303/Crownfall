import { mvpAwards } from "../../meta/mvp";
import type { EndPlayer } from "../../net/protocol";
import { MetaIcon } from "./MetaIcon";

/** One award card per category: the player who led it and by how much. */
export function MvpAwards({ players, you }: { players: EndPlayer[]; you: number }) {
  const awards = mvpAwards(players);
  if (awards.length === 0) return null;
  return (
    <ul className="mvp-awards">
      {awards.map(({ category, player, value }) => (
        <li key={category.id} className={player.index === you ? "mine" : ""}>
          <span className="mvp-icon">
            <MetaIcon id={category.icon} />
          </span>
          <small>{category.title}</small>
          <strong>{player.name}</strong>
          <small>{category.describe(value)}</small>
        </li>
      ))}
    </ul>
  );
}
