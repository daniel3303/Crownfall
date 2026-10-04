import type { CSSProperties } from "react";
import { worn } from "../../meta/progression";
import type { Unlockable } from "../../meta/unlocks";
import { MetaIcon } from "./MetaIcon";
import { useMeta } from "./meta-store";

/** Background of a banner cosmetic: its two colours as a vertical gradient. */
export function bannerStyle(banner: Unlockable): CSSProperties {
  const [top, bottom] = (banner.look ?? "#3a3226,#251f17").split(",");
  return { background: `linear-gradient(${top}, ${bottom})` };
}

/** A portrait frame cosmetic as a coloured ring. */
export function frameStyle(frame: Unlockable): CSSProperties {
  return { boxShadow: `0 0 0 2px ${frame.look ?? "#6b5a3a"}, 0 0 8px ${frame.look ?? "#6b5a3a"}66` };
}

export function Crest({ crest }: { crest: Unlockable }) {
  return (
    <span className="crest" title={crest.name}>
      <MetaIcon id={crest.look ?? "shield"} />
    </span>
  );
}

/** What the local profile wears, read live so a change in the menu shows at once. */
export function useLook() {
  const meta = useMeta((v) => v.meta);
  return {
    title: worn(meta, "title"),
    crest: worn(meta, "crest"),
    banner: worn(meta, "banner"),
    frame: worn(meta, "frame"),
  };
}

/** The local player's crest and title beside their name in the lobby and on the scoreboard; other seats show none. */
export function OwnFlair() {
  const look = useLook();
  return (
    <span className="own-flair">
      <Crest crest={look.crest} />
      <small className="flair-title">{look.title.name}</small>
    </span>
  );
}
