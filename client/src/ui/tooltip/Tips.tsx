import { buildingStats, content, costList, heroCooldownFactor, maxLevel, RESOURCE_NAMES, troopRank, unitDef, type AbilityDef, type BuildingDef, type Cost, type HeroStatDef, type ResourceName, type UnitDef } from "../../content/content";
import { fitsIntoWall, isLineBuilding } from "../../game/placement";
import type { HeroState } from "../../net/protocol";
import { storageLevel, storageSources, upgradeChanges, upgradeRequirement } from "../hud/building-upgrades";
import { statEffect } from "../hud/hero-stats";
import { Icon } from "../icons";
import { useHud } from "../store";
import { counters, RESOURCE_SOURCE, ROLE, spentOn } from "./help";

function Header({ name, hotkey }: { name: string; hotkey?: string }) {
  return (
    <div className="tip-head">
      <strong>{name}</strong>
      {hotkey && <kbd>{hotkey}</kbd>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <>
      <span>{label}</span>
      <b>{value}</b>
    </>
  );
}

/** A price, with each resource you are short of shown in red against your current stock. */
function CostRow({ cost }: { cost?: Cost }) {
  const stock = useHud((s) => s.stats?.resources);
  const amounts = costList(cost);
  if (amounts.every((amount) => amount === 0)) return null;
  return (
    <div className="tip-cost">
      {amounts.map((amount, i) =>
        amount > 0 ? (
          <span key={RESOURCE_NAMES[i]} className={(stock?.[i] ?? 0) >= amount ? "" : "short"}>
            <Icon id={RESOURCE_NAMES[i]!} /> {amount}
          </span>
        ) : null,
      )}
    </div>
  );
}

/** A unit's card; a rank above 1 shows the health and attack of a unit trained at that building level. */
export function UnitTip({ def, hotkey, rank = 1 }: { def: UnitDef; hotkey?: string; rank?: number }) {
  const { strong, weak } = counters(def);
  const bonus = troopRank(def.id, rank);
  return (
    <>
      <Header name={def.name} hotkey={hotkey} />
      <p className="tip-text">{ROLE[def.id]}</p>
      <CostRow cost={def.cost} />
      <div className="tip-stats">
        <Stat label="Health" value={Math.round(def.hp * (bonus?.hp ?? 1))} />
        <Stat label="Attack" value={`${Math.round(def.attack * (bonus?.attack ?? 1) * 10) / 10} ${def.damageType === "pierce" ? "ranged" : "melee"}`} />
        {def.range >= 2 && <Stat label="Range" value={def.range} />}
        <Stat label="Armor (melee / ranged)" value={`${def.armor.melee} / ${def.armor.pierce}`} />
        <Stat label="Speed" value={def.speed} />
        {def.trainTime && <Stat label="Training" value={`${def.trainTime} s`} />}
      </div>
      {bonus && (
        <div className="tip-good">
          {bonus.name}: {bonusPercent(bonus.hp)} health and {bonusPercent(bonus.attack)} attack from a level {rank} {bonus.trainer.toLowerCase()}
        </div>
      )}
      {strong.length > 0 && <div className="tip-good">Strong against {strong.join(", ")}</div>}
      {weak.length > 0 && <div className="tip-bad">Weak against {weak.join(", ")}</div>}
    </>
  );
}

function bonusPercent(multiplier: number): string {
  return `+${Math.round((multiplier - 1) * 100)}%`;
}

export function BuildingTip({ def }: { def: BuildingDef }) {
  return (
    <>
      <Header name={def.name} hotkey={def.hotkey} />
      <p className="tip-text">{ROLE[def.id]}</p>
      <CostRow cost={def.cost} />
      <div className="tip-stats">
        <Stat label="Health" value={def.hp} />
        <Stat label="Build time" value={`${def.buildTime} s`} />
        {def.pop && <Stat label="Population" value={`+${def.pop}`} />}
        {def.attack && <Stat label="Arrows" value={`${def.attack.damage} damage, range ${def.attack.range}`} />}
        {def.dropOff && <Stat label="Takes" value={def.dropOff.join(", ")} />}
        {def.trains && <Stat label="Trains" value={def.trains.map((id) => unitDef(id).name).join(", ")} />}
        {(def.storage ?? 0) > 0 && <Stat label="Storage" value={`+${def.storage} of each resource`} />}
        {def.market && <Stat label="Market" value="trade for gold" />}
        {maxLevel(def) > 1 && <Stat label="Upgrades" value={`to level ${maxLevel(def)}`} />}
      </div>
      {def.hotkey && <div className="tip-hint">{placementHint(def)}</div>}
    </>
  );
}

function placementHint(def: BuildingDef): string {
  if (isLineBuilding(def)) return "Click, then drag along the ground to lay a line of wall. Hold Shift to keep building.";
  if (fitsIntoWall(def)) return "Click, then click the ground, or one of your wall tiles to replace it for the price difference. Shift-click to place several.";
  return "Click, then click the ground to place it. Shift-click to place several.";
}

const TARGET_HINT: Partial<Record<AbilityDef["effect"], string>> = {
  strike: "Press the key, then click where it lands.",
  dash: "Press the key, then click where to charge.",
};

/** An ability's cooldown at the hero's level, with the share higher levels have taken off it. */
function cooldownText(base: number, heroLevel: number): string {
  const factor = heroCooldownFactor(heroLevel);
  const seconds = `${Number((base * factor).toFixed(1))} s`;
  return factor < 1 ? `${seconds} (−${Math.round((1 - factor) * 100)}% at level ${heroLevel})` : seconds;
}

export function AbilityTip({ ability, heroLevel }: { ability: AbilityDef; heroLevel: number }) {
  const locked = heroLevel < ability.unlockLevel;
  const damage = ability.damage !== undefined ? ability.damage + (ability.damagePerLevel ?? 0) * Math.max(0, heroLevel - 1) : undefined;
  return (
    <>
      <Header name={ability.name} hotkey={ability.key} />
      <p className="tip-text">{ability.description}</p>
      <div className="tip-stats">
        {damage !== undefined && <Stat label="Damage" value={ability.damagePerLevel ? `${damage} (+${ability.damagePerLevel} per level)` : damage} />}
        <Stat label="Cooldown" value={cooldownText(ability.cooldown, heroLevel)} />
        {ability.range !== undefined && <Stat label="Range" value={ability.range} />}
        <Stat label="Radius" value={ability.radius} />
        {ability.duration !== undefined && <Stat label="Lasts" value={`${ability.duration} s`} />}
        {ability.stun !== undefined && <Stat label="Stun" value={`${ability.stun} s`} />}
      </div>
      {locked ? (
        <div className="tip-bad">Unlocks at hero level {ability.unlockLevel}</div>
      ) : (
        <div className="tip-hint">{TARGET_HINT[ability.effect] ?? "Press the key to use it."}</div>
      )}
    </>
  );
}

export function HeroStatTip({ stat, ranks }: { stat: HeroStatDef; ranks: number }) {
  return (
    <>
      <Header name={stat.name} />
      <p className="tip-text">{stat.description}</p>
      <div className="tip-stats">
        <Stat label="Rank" value={ranks} />
        <Stat label="Now" value={ranks > 0 ? statEffect(stat, ranks) : "nothing yet"} />
        <Stat label="Next rank" value={statEffect(stat, ranks + 1)} />
      </div>
      <div className="tip-hint">Click to spend one point.</div>
    </>
  );
}

export function ReviveTip({ hero }: { hero: HeroState }) {
  const name = unitDef(hero.unit).name;
  const cost = Object.fromEntries(RESOURCE_NAMES.map((resource, i) => [resource, hero.reviveCost[i] ?? 0])) as Cost;
  return (
    <>
      <Header name="Revive hero" />
      <p className="tip-text">
        Bring your level {hero.level} {name} back beside a town center, with its experience and stat ranks. The price rises with every level.
      </p>
      <CostRow cost={cost} />
      {hero.reviveSeconds > 0 ? (
        <div className="tip-bad">Ready in {Math.ceil(hero.reviveSeconds)} s</div>
      ) : !hero.canRevive ? (
        <div className="tip-bad">Needs a completed town center</div>
      ) : (
        <div className="tip-hint">Click to pay and revive.</div>
      )}
    </>
  );
}

export function ResourceTip({ resource }: { resource: ResourceName }) {
  const index = RESOURCE_NAMES.indexOf(resource);
  const amount = useHud((s) => s.stats?.resources[index] ?? 0);
  const cap = useHud((s) => s.stats?.storage?.[index] ?? 0);
  const level = storageLevel(amount, cap);
  const sources = storageSources().map((b) => `${b.name} ${b.storage}`).join(", ");
  return (
    <>
      <Header name={resource[0]!.toUpperCase() + resource.slice(1)} />
      <p className="tip-text">{RESOURCE_SOURCE[resource]}</p>
      <div className="tip-stats">
        <Stat label="Stored" value={`${amount} / ${cap}`} />
      </div>
      <p className="tip-text">
        Storage caps each resource; anything gathered past it is lost. Each completed building adds its share ({sources}), and upgrades add more. Build or upgrade storehouses, or upgrade your town center, to raise it.
      </p>
      {level === "full" && <div className="tip-bad">Full: new {resource} is being lost.</div>}
      {level === "near" && <div className="tip-bad">Nearly full.</div>}
      <div className="tip-hint">Pays for {spentOn(resource).join(", ")}.</div>
    </>
  );
}

/** The next level of a building: price, time, every stat it changes and any town center requirement. */
export function UpgradeTip({ def, level, townCenterLevel }: { def: BuildingDef; level: number; townCenterLevel: number }) {
  const next = buildingStats(def, level + 1);
  const required = upgradeRequirement(def, level);
  const hpMultiplier = useHud((s) => {
    const me = s.match?.players.find((p) => p.index === s.match?.you);
    return content.races.find((r) => r.id === me?.race)?.buildingHpMultiplier ?? 1;
  });
  return (
    <>
      <Header name={`Upgrade to level ${level + 1}`} hotkey="U" />
      <p className="tip-text">
        {def.name} level {level} of {maxLevel(def)}. Takes {next.time} s; it keeps working meanwhile, but training pauses.
      </p>
      <CostRow cost={next.cost} />
      <div className="tip-stats">
        {upgradeChanges(def, level, hpMultiplier).map((change) => (
          <Stat key={change.label} label={change.label} value={`${change.from} → ${change.to}`} />
        ))}
      </div>
      {required > townCenterLevel ? (
        <div className="tip-bad">Requires a level {required} town center</div>
      ) : (
        <div className="tip-hint">Cancel any time for a full refund.</div>
      )}
    </>
  );
}

/** One market lot bought or sold for gold, and how prices move. */
export function TradeTip({ resource, buy, price, lot }: { resource: ResourceName; buy: boolean; price: number; lot: number }) {
  return (
    <>
      <Header name={`${buy ? "Buy" : "Sell"} ${lot} ${resource}`} />
      <p className="tip-text">
        {buy ? `Costs ${price} gold.` : `Earns ${price} gold.`} Buying raises this price and selling lowers it; prices drift back over time. Selling right after buying loses the spread.
      </p>
      <CostRow cost={buy ? { gold: price } : { [resource]: lot }} />
    </>
  );
}

export function PopulationTip() {
  const houses = content.buildings.filter((b) => b.pop).map((b) => `${b.name} +${b.pop}`);
  return (
    <>
      <Header name="Population" />
      <p className="tip-text">Units alive and your current limit. Build more to raise it: {houses.join(", ")}.</p>
      <div className="tip-hint">Hard cap {content.rules.populationLimit}.</div>
    </>
  );
}

export function TextTip({ title, text, hotkey }: { title: string; text: string; hotkey?: string }) {
  return (
    <>
      <Header name={title} hotkey={hotkey} />
      <p className="tip-text">{text}</p>
    </>
  );
}
