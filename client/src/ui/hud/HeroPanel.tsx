import { canAfford, content, costList, heroKit, itemDef, RESOURCE_NAMES, shutdownGold, unitDef, type Cost, type TalentDef } from "../../content/content";
import type { HeroState } from "../../net/protocol";
import { session } from "../../session";
import { Icon, Portrait } from "../icons";
import { store, useHud } from "../store";
import { AbilityTip, HeroStatTip, ItemTip, ReviveTip, TalentTip, TextTip } from "../tooltip/Tips";
import { tipProps } from "../tooltip/use-tip";
import { openTalentTier, pickedTalents, talentIcon } from "./hero-kit";
import { heroStatRows } from "./hero-stats";

export function HeroPanel() {
  const hero = useHud((s) => s.stats?.hero);
  // A server built before hero stats existed sends no `stats`; render empty rather than crash the HUD.
  if (!hero?.stats) return <div className="hero-panel panel" />;
  const def = unitDef(hero.unit);
  const dead = hero.id === 0;
  const openTier = openTalentTier(hero.unit, hero.level, hero.talents);
  return (
    <div className="hero-panel panel">
      {(hero.unspentPoints > 0 || dead || openTier >= 0) && <HeroActions hero={hero} openTier={openTier} />}
      <button
        className="hero-portrait"
        onClick={() => session.game?.selectHero(true)}
        {...tipProps(() => <TextTip title={def.name} hotkey="Space" text="Select your hero and center the camera on it; hold it to keep the camera on your hero. A fallen hero is revived for resources at a town center." />)}
      >
        <span className="hero-icon">
          <Portrait id={hero.unit} />
        </span>
        <span className="hero-level">{hero.level}</span>
        {dead && <span className="hero-dead">{hero.reviveSeconds > 0 ? Math.ceil(hero.reviveSeconds) : <Icon id="revive" />}</span>}
      </button>
      <div className="hero-body">
        <div className="hero-name">
          {def.name}
          {hero.streak > 0 && <StreakBadge streak={hero.streak} />}
          <Talents hero={hero} />
        </div>
        <HealthBar hero={hero} />
        <XpBar hero={hero} />
        <Abilities hero={hero} dead={dead} />
      </div>
      <Inventory hero={hero} />
      <div className="hero-stats">
        {heroStatRows(hero).map((row) => (
          <span key={row.id} className="hero-stat" {...tipProps(() => <TextTip title={row.label} text={row.tip} />)}>
            <Icon id={row.icon} />
            <b>{row.value}</b>
            {row.bonus && <em>{row.bonus}</em>}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The hero's kill streak, and what an enemy earns for ending it. */
function StreakBadge({ streak }: { streak: number }) {
  const bounty = shutdownGold(streak);
  const text = `${streak} enemy ${streak === 1 ? "hero" : "heroes"} slain since your hero last fell. ${bounty > 0 ? `The enemy who ends it earns ${bounty} extra gold.` : `From ${content.rules.heroShutdownStreak} kills, ending it pays the enemy a shutdown bonus.`}`;
  return (
    <span className="hero-streak" {...tipProps(() => <TextTip title="Kill streak" text={text} />)}>
      <Icon id="streak" />
      {streak}
    </span>
  );
}

/** Health with the resting regeneration shown as a pulsing bar and its rate. */
function HealthBar({ hero }: { hero: HeroState }) {
  const { hp, maxHp, regen, regenerating } = hero.stats;
  const ratio = maxHp > 0 ? Math.min(1, hp / maxHp) : 0;
  const tip = regenerating
    ? `${Math.ceil(hp)} / ${Math.ceil(maxHp)} health, regenerating ${regen.toFixed(1)} per second.`
    : `${Math.ceil(hp)} / ${Math.ceil(maxHp)} health. Regenerates after ${content.rules.heroRegenDelaySeconds} s without taking damage.`;
  return (
    <div className={`bar hp hero-hp ${regenerating ? "regen" : ""}`} {...tipProps(() => <TextTip title="Health" text={tip} />)}>
      <div style={{ width: `${ratio * 100}%` }} />
      {regenerating && <span className="bar-label">+{regen.toFixed(1)}/s</span>}
    </div>
  );
}

function XpBar({ hero }: { hero: HeroState }) {
  const span = Math.max(1, hero.xpNextLevel - hero.xpLevelStart);
  const xp = Math.min(1, (hero.xp - hero.xpLevelStart) / span);
  const text = `${hero.xp - hero.xpLevelStart} / ${span} experience to level ${hero.level + 1}. Kills near your hero give experience, shared with allied heroes nearby; enemy heroes above your level give a bonus.`;
  return (
    <div className="bar xp" {...tipProps(() => <TextTip title={`Level ${hero.level}`} text={text} />)}>
      <div style={{ width: `${xp * 100}%` }} />
    </div>
  );
}

/** One badge per talent tier: the pick, or a lock showing the level that opens it. */
function Talents({ hero }: { hero: HeroState }) {
  const picked = pickedTalents(hero.unit, hero.talents);
  const levels = content.rules.heroTalentLevels;
  return (
    <span className="hero-talents">
      {picked.map((talent, tier) => {
        const level = levels[tier] ?? 0;
        return talent ? (
          <span key={tier} className="hero-talent picked" {...tipProps(() => <TalentTip talent={talent} tierLevel={level} state="picked" />)}>
            <Icon id={talentIcon(talent)} />
          </span>
        ) : (
          <span key={tier} className="hero-talent" {...tipProps(() => <TextTip title="Talent" text={`At hero level ${level} pick one of two talents for your ${unitDef(hero.unit).name}. Talents last the whole match, through death.`} />)}>
            {level}
          </span>
        );
      })}
    </span>
  );
}

function Abilities({ hero, dead }: { hero: HeroState; dead: boolean }) {
  const talents = pickedTalents(hero.unit, hero.talents);
  return (
    <div className="abilities">
      {heroKit(hero.unit).map((ability, slot) => {
        const locked = hero.level < ability.unlockLevel;
        const cooldown = hero.cooldowns[slot] ?? 0;
        return (
          <button
            key={ability.id}
            className={`ability ${locked ? "locked" : ""}`}
            disabled={dead}
            {...tipProps(() => <AbilityTip ability={ability} heroLevel={hero.level} cooldownFactor={hero.cooldownFactor} talents={talents} />)}
            onClick={() => session.game?.castAbility(slot, false)}
          >
            <span>
              <Icon id={ability.id} />
            </span>
            <kbd>{ability.key}</kbd>
            {cooldown > 0 && <span className="cooldown">{Math.ceil(cooldown)}</span>}
            {locked && (
              <span className="cooldown">
                <Icon id="locked" />
                {ability.unlockLevel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The hero's item slots and the shop button. With the shop open and the hero at a town center, clicking a carried item
 * sells it; otherwise a click opens the shop.
 */
function Inventory({ hero }: { hero: HeroState }) {
  const shopOpen = useHud((s) => s.shop);
  const items = hero.items ?? [];
  return (
    <div className="inventory">
      <div className="inventory-slots">
        {items.map((id, slot) => {
          const item = id ? itemDef(id) : undefined;
          const selling = !!item && shopOpen && hero.canShop;
          return (
            <button
              key={slot}
              className={`item-slot ${item ? "filled" : "empty"} ${selling ? "selling" : ""}`}
              onClick={() => (selling ? session.game?.sellItem(slot) : store.set({ shop: true }))}
              {...tipProps(() =>
                item ? <ItemTip item={item} slot={slot} canShop={shopOpen && hero.canShop} /> : <TextTip title="Empty slot" text="Buy items for your hero at the shop while it stands near one of your town centers." />,
              )}
            >
              {item && <Icon id={item.id} />}
            </button>
          );
        })}
      </div>
      <button
        className={`btn btn-small shop-button ${shopOpen ? "active" : ""} ${hero.canShop ? "at-shop" : ""}`}
        onClick={() => store.set({ shop: !shopOpen })}
        {...tipProps(() => <TextTip title="Hero shop" hotkey="P" text="Buy items that make your hero stronger. Your hero must stand near one of your town centers to trade; items stay through death." />)}
      >
        <Icon id="shop" /> Shop
      </button>
    </div>
  );
}

/**
 * The strip above the panel: the open talent tier's choice, stat picks while points are banked, and the revive
 * countdown or button while fallen.
 */
function HeroActions({ hero, openTier }: { hero: HeroState; openTier: number }) {
  const stock = useHud((s) => s.stats?.resources ?? []);
  const dead = hero.id === 0;
  return (
    <div className="hero-actions panel">
      {openTier >= 0 && <TalentChoice hero={hero} tier={openTier} />}
      {hero.unspentPoints > 0 && (
        <div className="hero-points">
          <span className="hero-points-count" {...tipProps(() => <TextTip title="Stat points" text="Each level gives one point. Spend it on a stat; unspent points are kept, and ranks last through death." />)}>
            <Icon id="points" />
            {hero.unspentPoints}
          </span>
          {content.heroStats.map((stat, i) => (
            <button key={stat.id} className="hero-stat-pick" onClick={() => session.game?.learnStat(stat.id)} {...tipProps(() => <HeroStatTip stat={stat} ranks={hero.ranks[i] ?? 0} />)}>
              <Icon id={stat.id} />
              <span className="rank">{hero.ranks[i] ?? 0}</span>
            </button>
          ))}
        </div>
      )}
      {dead && <ReviveButton hero={hero} stock={stock} />}
    </div>
  );
}

/** The two talents of an open tier; one click takes a talent for good. */
function TalentChoice({ hero, tier }: { hero: HeroState; tier: number }) {
  const options: TalentDef[] = unitDef(hero.unit).talents?.[tier] ?? [];
  const level = content.rules.heroTalentLevels[tier] ?? 0;
  return (
    <div className="hero-talent-pick">
      <span className="hero-points-count" {...tipProps(() => <TextTip title="Talent" text="Your hero reached a talent level. Take one of the two talents; it lasts the whole match, through death." />)}>
        <Icon id="talent" />
      </span>
      {options.map((talent) => (
        <button key={talent.id} className="btn btn-small talent-option" onClick={() => session.game?.pickTalent(tier, talent.id)} {...tipProps(() => <TalentTip talent={talent} tierLevel={level} state="open" />)}>
          <Icon id={talentIcon(talent)} /> {talent.name}
        </button>
      ))}
    </div>
  );
}

function ReviveButton({ hero, stock }: { hero: HeroState; stock: number[] }) {
  const waiting = hero.reviveSeconds > 0;
  const cost = Object.fromEntries(RESOURCE_NAMES.map((name, i) => [name, hero.reviveCost[i] ?? 0])) as Cost;
  const affordable = canAfford(cost, stock);
  const label = waiting ? `Revive in ${Math.ceil(hero.reviveSeconds)}s` : "Revive";
  return (
    <button
      className={`btn btn-small hero-revive ${!waiting && affordable && hero.canRevive ? "" : "poor"}`}
      aria-disabled={waiting || !hero.canRevive}
      onClick={() => !waiting && hero.canRevive && session.game?.reviveHero()}
      {...tipProps(() => <ReviveTip hero={hero} />)}
    >
      <Icon id="revive" /> {label}
      {!waiting &&
        costList(cost).map((amount, i) =>
          amount > 0 ? (
            <span key={RESOURCE_NAMES[i]} className={(stock[i] ?? 0) >= amount ? "" : "short"}>
              <Icon id={RESOURCE_NAMES[i]!} />
              {amount}
            </span>
          ) : null,
        )}
    </button>
  );
}
