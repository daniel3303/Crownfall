import { buildingDef, content, heroKillGold, maxLevel, RESOURCE_NAMES, troopRank, unitDef } from "../../content/content";
import { Flags } from "../../net/protocol";
import { Portrait } from "../icons";
import { useHud, type EntityView, type SelectionView } from "../store";
import { ROLE } from "../tooltip/help";
import { BuildingTip, TextTip, UnitTip } from "../tooltip/Tips";
import { tipProps } from "../tooltip/use-tip";

export function SelectionPanel() {
  const selection = useHud((s) => s.selection);
  return <div className="selection panel">{describe(selection)}</div>;
}

function describe(selection: SelectionView) {
  if (selection.kind === "none") return <p className="hint">Click to select, or right-drag a box round your troops. Right-click to give orders. Drag, swipe with two fingers or use the arrow keys to move the map.</p>;
  if (selection.kind === "units" && !selection.single) {
    return (
      <div className="groups">
        {selection.groups.map((group) => (
          <span key={group.defId} className="group" {...tipProps(() => <UnitTip def={unitDef(group.defId)} />)}>
            <Portrait id={group.defId} />
            <b>{group.count}</b>
          </span>
        ))}
      </div>
    );
  }
  const entity = selection.kind === "units" ? selection.single! : selection.entity;
  const ratio = entity.maxHp > 0 ? entity.hp / entity.maxHp : 0;
  const isNode = entity.category === "node";
  const isHero = (entity.flags & Flags.Hero) !== 0;
  const carrying = entity.category === "unit" && (entity.flags & Flags.Carrying) !== 0 && !isHero;
  const rank = entity.category === "unit" && !isHero ? troopRank(entity.defId, entity.level) : null;
  return (
    <div className="entity">
      <span className="entity-icon" {...tipProps(() => entityTip(entity))}>
        <Portrait id={entity.defId} />
      </span>
      <div>
        <div className="entity-name">
          {entity.name}
          {isHero && ` · level ${entity.extra}`}
          {rank && ` · ${rank.name}`}
          {entity.category === "building" && maxLevel(buildingDef(entity.defId)) > 1 && ` · level ${entity.level} of ${maxLevel(buildingDef(entity.defId))}`}
        </div>
        <div className="entity-owner" style={{ color: entity.color }}>
          {entity.ownerName}
        </div>
        <div className="bar hp">
          <div style={{ width: `${ratio * 100}%` }} className={isNode ? "node" : ""} />
        </div>
        <small>
          {isNode ? `${entity.hp} left` : `${entity.hp} / ${entity.maxHp}`}
          {carrying && ` · carrying ${entity.extra} ${RESOURCE_NAMES[(entity.flags >> 2) & 3]}`}
          {isHero && ` · bounty ${heroKillGold(entity.extra)} gold`}
        </small>
        {entity.upgrading && (
          <div className="upgrade-progress">
            <div className="bar upgrade">
              <div style={{ width: `${entity.upgradeProgress}%` }} />
            </div>
            <small>
              Upgrading to level {entity.level + 1}: {entity.upgradeProgress}%
            </small>
          </div>
        )}
      </div>
    </div>
  );
}

function entityTip(entity: EntityView) {
  if (entity.category === "unit") return <UnitTip def={unitDef(entity.defId)} rank={(entity.flags & Flags.Hero) === 0 ? entity.level : 1} />;
  if (entity.category === "building") return <BuildingTip def={buildingDef(entity.defId)} race={entity.race} />;
  const node = content.nodes.find((n) => n.id === entity.defId);
  return <TextTip title={entity.name} text={`${ROLE[entity.defId] ?? ""} Holds ${node?.amount ?? entity.maxHp} ${node?.resource ?? ""} when full.`} />;
}
