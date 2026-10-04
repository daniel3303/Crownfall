import { Icon } from "../icons";
import { useHud } from "../store";

const OFFSET_PX = 18;

/** A small card beside the cursor naming the world entity under it: owner, health or resources left, and the right-click action. */
export function HoverLabel() {
  const hover = useHud((s) => s.hover);
  if (!hover) return null;
  const { entity } = hover;
  const ratio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 0;
  const isNode = entity.category === "node";
  const flip = hover.x > window.innerWidth - 260;
  return (
    <div className="hover-label" style={{ top: hover.y + OFFSET_PX, ...(flip ? { right: window.innerWidth - hover.x + OFFSET_PX } : { left: hover.x + OFFSET_PX }) }}>
      <div className="hover-name">
        <span><Icon id={entity.defId} /></span> {entity.name}
      </div>
      {entity.ownerName && (
        <div className="hover-owner" style={{ color: entity.color }}>
          {entity.ownerName}
        </div>
      )}
      <div className="hover-bar">
        <div className={isNode ? "node" : ""} style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="hover-meta">{isNode ? `${entity.hp} left` : `${entity.hp} / ${entity.maxHp}`}</div>
      {hover.action && <div className="hover-action">{hover.action}</div>}
    </div>
  );
}
