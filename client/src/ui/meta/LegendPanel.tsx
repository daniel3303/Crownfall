import { content } from "../../content/content";
import { levelInfo } from "../../meta/levels";
import { isUnlockedAt, unlockablesOf, type CosmeticSlot } from "../../meta/unlocks";
import { Icon, Portrait } from "../icons";
import { bannerStyle, Crest, frameStyle, useLook } from "./cosmetics";
import { MetaIcon } from "./MetaIcon";
import { metaStore, useMeta } from "./meta-store";

const SLOTS: { slot: CosmeticSlot; label: string }[] = [
  { slot: "title", label: "Title" },
  { slot: "crest", label: "Crest" },
  { slot: "banner", label: "Banner" },
  { slot: "frame", label: "Frame" },
];

/** Profile level, XP toward the next level and the cosmetics it has unlocked, with pickers to wear them. */
export function LegendPanel({ name, race }: { name: string; race: string }) {
  const meta = useMeta((v) => v.meta);
  const look = useLook();
  const info = levelInfo(meta.xp);
  const hero = content.races.find((r) => r.id === race)?.hero ?? "";
  return (
    <div className="legend">
      <div className="legend-card" style={bannerStyle(look.banner)}>
        <span className="legend-portrait" style={frameStyle(look.frame)}>
          <Portrait id={hero} />
        </span>
        <div className="legend-who">
          <strong>
            <Crest crest={look.crest} /> {name}
          </strong>
          <small>{look.title.name}</small>
        </div>
        <div className="legend-level" title={`${meta.xp} XP in all`}>
          <small>Level</small>
          <strong>{info.level}</strong>
        </div>
      </div>
      <div className="meta-bar xp-bar" role="progressbar" aria-label="XP to the next level" aria-valuemin={0} aria-valuemax={info.needed} aria-valuenow={info.into}>
        <span style={{ width: `${info.progress * 100}%` }} />
      </div>
      <p className="hint">
        {info.into} / {info.needed} XP to level {info.level + 1}
      </p>
      <details className="customize">
        <summary>Customize your banner</summary>
        {SLOTS.map(({ slot, label }) => (
          <div key={slot} className="cosmetic-row">
            <span className="cosmetic-label">{label}</span>
            <div className="cosmetic-options">
              {unlockablesOf(slot).map((item) => {
                const open = isUnlockedAt(item.id, info.level);
                const active = look[slot].id === item.id;
                return (
                  <button
                    key={item.id}
                    className={`cosmetic ${active ? "active" : ""}`}
                    disabled={!open}
                    title={open ? item.name : `${item.name}: unlocks at level ${item.level}`}
                    onClick={() => metaStore.equip(slot, item.id)}
                    style={slot === "banner" ? bannerStyle(item) : slot === "frame" ? { borderColor: item.look } : undefined}
                  >
                    {slot === "crest" ? <MetaIcon id={item.look ?? "shield"} /> : slot === "title" ? item.name : slot === "frame" ? <span className="frame-dot" style={{ background: item.look }} /> : null}
                    {!open && (
                      <small className="cosmetic-lock">
                        <Icon id="locked" /> {item.level}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </details>
    </div>
  );
}
