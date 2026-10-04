import { buildingStats, content, costList, itemRefund, maxLevel, RESOURCE_NAMES, trainableFor, troopRank, unitDef, type AbilityDef, type BuildingDef, type Cost, type HeroStatDef, type ItemDef, type ResourceName, type TalentDef, type UnitDef } from "../../content/content";
import { fitsIntoWall, isLineBuilding } from "../../game/placement";
import type { HeroState } from "../../net/protocol";
import { storageLevel, storageSources, upgradeChanges, upgradeRequirement } from "../hud/building-upgrades";
import { abilityNumbers, talentLines } from "../hud/hero-kit";
import { statEffect } from "../hud/hero-stats";
import { itemStatLines, SHOP_BLOCK_TEXT, type ShopBlock } from "../hud/items";
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

/** A unit's card; a rank above 1 shows the health and attack of a unit trained at that building level, and `lock` is why its trainer cannot train it yet. */
export function UnitTip({ def, hotkey, rank = 1, lock }: { def: UnitDef; hotkey?: string; rank?: number; lock?: string | null }) {
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
      {lock && <div className="tip-bad">{lock} Upgrade it to train them.</div>}
    </>
  );
}

function bonusPercent(multiplier: number): string {
  return `+${Math.round((multiplier - 1) * 100)}%`;
}

/** A building's card; it lists the units a seat of `race` trains there, the viewer's own race unless given. */
export function BuildingTip({ def, race }: { def: BuildingDef; race?: string }) {
  const myRace = useHud((s) => s.match?.players.find((p) => p.index === s.match?.you)?.race);
  const trains = trainableFor(def, race ?? myRace);
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
        {trains.length > 0 && <Stat label="Trains" value={trains.map((id) => unitDef(id).name).join(", ")} />}
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
  dash: "Press the key, then click where to go.",
};

/** An ability's cooldown after the hero's level and items, with the share they have taken off it. */
function cooldownText(base: number, factor: number): string {
  const seconds = `${Number((base * factor).toFixed(1))} s`;
  return factor < 1 ? `${seconds} (−${Math.round((1 - factor) * 100)}% from level and items)` : seconds;
}

/** An ability as the hero casts it now: its numbers at the hero's level with every talent that changes it. */
export function AbilityTip({ ability, heroLevel, cooldownFactor, talents = [] }: { ability: AbilityDef; heroLevel: number; cooldownFactor: number; talents?: readonly (TalentDef | null)[] }) {
  const locked = heroLevel < ability.unlockLevel;
  const numbers = abilityNumbers(ability, heroLevel, talents);
  const perLevel = (amount: number | undefined) => (amount ? ` (+${amount} per level)` : "");
  const shaping = talents.filter((t): t is TalentDef => !!t && t.ability === ability.id);
  return (
    <>
      <Header name={ability.name} hotkey={ability.key} />
      <p className="tip-text">{ability.description}</p>
      <div className="tip-stats">
        {numbers.damage !== undefined && <Stat label="Damage" value={`${numbers.damage}${perLevel(ability.damagePerLevel)}`} />}
        {numbers.heal !== undefined && <Stat label="Heals" value={`${numbers.heal}${perLevel(ability.healPerLevel)}`} />}
        <Stat label="Cooldown" value={cooldownText(numbers.cooldown, cooldownFactor)} />
        {numbers.range !== undefined && <Stat label="Range" value={numbers.range} />}
        {numbers.radius > 0 && <Stat label="Radius" value={numbers.radius} />}
        {numbers.duration !== undefined && <Stat label="Lasts" value={`${numbers.duration} s`} />}
        {numbers.stun !== undefined && <Stat label="Stun" value={`${numbers.stun} s`} />}
      </div>
      {shaping.map((talent) => (
        <div key={talent.id} className="tip-good">
          <Icon id="talent" /> {talent.name}: {talentLines(talent).join(", ")}
        </div>
      ))}
      {locked ? (
        <div className="tip-bad">Unlocks at hero level {ability.unlockLevel}</div>
      ) : (
        <div className="tip-hint">{TARGET_HINT[ability.effect] ?? "Press the key to use it."}</div>
      )}
    </>
  );
}

/** A talent option or pick: what it adds, and how to take it or when it was taken. */
export function TalentTip({ talent, tierLevel, state }: { talent: TalentDef; tierLevel: number; state: "open" | "picked" }) {
  const hint =
    state === "open" ? (
      <div className="tip-hint">Click to take it. A tier holds one talent for the rest of the match, through death.</div>
    ) : (
      <div className="tip-good">Taken at hero level {tierLevel}.</div>
    );
  return (
    <>
      <Header name={talent.name} />
      <div className="tip-item-stats">
        {talentLines(talent).map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>
      {hint}
    </>
  );
}

/** An item's price and stats; `slot` marks one the hero carries, which sells back for part of its price. */
export function ItemTip({ item, block, slot, canShop }: { item: ItemDef; block?: ShopBlock; slot?: number; canShop?: boolean }) {
  const refund = itemRefund(item);
  const refundText = RESOURCE_NAMES.filter((name) => refund[name]).map((name) => `${refund[name]} ${name}`).join(", ");
  return (
    <>
      <Header name={item.name} />
      <p className="tip-text">{item.description}</p>
      {slot === undefined && <CostRow cost={item.cost} />}
      <div className="tip-item-stats">
        {itemStatLines(item).map((line) => (
          <span key={line.icon}>
            <Icon id={line.icon} /> {line.text}
          </span>
        ))}
      </div>
      {slot !== undefined ? (
        canShop ? <div className="tip-hint">Click to sell for {refundText}.</div> : <div className="tip-hint">Sells for {refundText} near your town center. Items stay through death.</div>
      ) : block ? (
        <div className="tip-bad">{SHOP_BLOCK_TEXT[block]}</div>
      ) : (
        <div className="tip-hint">Click to buy.</div>
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
