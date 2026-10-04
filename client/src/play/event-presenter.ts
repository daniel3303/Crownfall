import { audio, type SoundId } from "../audio";
import { SwingClock, type Swinger } from "../audio/swings";
import { buildingDef, content, footprintSize, kindInfo } from "../content/content";
import type { ClientWorld, WorldEntity } from "../game/world";
import { Activity, NEUTRAL_OWNER, type GameEvent } from "../net/protocol";
import { pingColor, type Minimap } from "../render/minimap";
import type { GameRenderer } from "../render/renderer";
import { store } from "../ui/store";

const RESOURCE_COLORS: Record<string, string> = { food: "#fca5a5", wood: "#d6a77a", stone: "#d4d4d8", gold: "#fde047" };
const DEPOSIT_SOUNDS: Record<string, SoundId> = { food: "depositFood", wood: "depositWood", stone: "depositStone", gold: "coin" };
const ABILITY_SOUNDS: Record<string, SoundId> = { nova: "cleave", buff: "rally", dash: "charge", strike: "meteorFall" };
// Units that reach farther than this shoot, and their shots arrive as events.
const MELEE_REACH = 1;
const MS_PER_SECOND = 1000;

/** Turns server events into effects, floating numbers, notices, minimap pings and sounds. */
export class EventPresenter {
  private readonly swings = new SwingClock();

  constructor(
    private readonly world: ClientWorld,
    private readonly renderer: GameRenderer,
    private readonly minimap: Minimap,
  ) {}

  present(events: GameEvent[], now: number): void {
    const fx = this.renderer.effects;
    for (const event of events) {
      switch (event.k) {
        case "shot": {
          const shooter = this.world.entities.get(event.from);
          fx.projectile(event.x, event.y, event.tx, event.ty, event.ticks * this.world.tickMs, now, shooter?.info.category === "building");
          const target = this.world.entities.get(event.to);
          audio.playAt(shooter?.info.category === "building" ? "bow" : "crossbow", event.x, event.y);
          audio.playAt(target?.info.category === "building" ? "arrowHitWood" : "arrowHit", event.tx, event.ty, (event.ticks * this.world.tickMs) / MS_PER_SECOND);
          break;
        }
        case "death":
          if (event.category !== "node") fx.dust(event.x, event.y, event.category === "building" ? 2.2 : 0.6, now);
          if (event.category === "building") {
            this.renderer.addRuin(event.entityKind, event.x, event.y, now, this.world.fallen.get(event.id)?.level ?? 1);
            audio.playAt("collapse", event.x, event.y);
          } else if (event.category === "unit") {
            this.renderer.addCorpse(event.id, event.entityKind, event.owner, event.x, event.y, now);
            audio.playAt(isCreep(event.entityKind) ? "deathBones" : "death", event.x, event.y);
          }
          break;
        case "deposit":
          if (event.player === this.world.you) {
            this.renderer.overlay.float(event.x, event.y, 1.6, `+${event.amount} ${event.resource}`, RESOURCE_COLORS[event.resource] ?? "#fff", now, 12);
            audio.playAt(DEPOSIT_SOUNDS[event.resource] ?? "coin", event.x, event.y);
          }
          break;
        case "ability":
          this.showAbility(event, now);
          break;
        case "impact":
          fx.explosion(event.x, event.y, event.radius, [1, 0.55, 0.15], now);
          audio.playAt("meteor", event.x, event.y);
          break;
        case "levelUp":
          fx.beam(event.x, event.y, [1, 0.85, 0.3], now);
          this.renderer.overlay.float(event.x, event.y, 2.6, `Level ${event.level}!`, "#fde047", now, 16);
          if (event.player === this.world.you) audio.play("levelUp");
          break;
        case "notice":
          if (event.player !== this.world.you) break;
          store.notify(event.text, event.tone, event.hasPosition ? event.x : undefined, event.hasPosition ? event.y : undefined);
          if (event.tone === "alert") {
            audio.play("alert");
            if (event.hasPosition) this.minimap.pings.push({ x: event.x, y: event.y, until: now + 3000, color: pingColor("alert") });
          }
          break;
        case "defeat":
          store.notify(`${event.name} has been defeated!`, event.player === this.world.you ? "alert" : "info");
          break;
        case "completed":
          if (event.player !== this.world.you) break;
          if (content.buildings.some((b) => b.id === event.what)) {
            store.notify(`${buildingDef(event.what).name} complete.`, "success");
            audio.play("built");
          } else {
            audio.play("trained");
          }
          break;
        case "tiles":
          break;
      }
    }
  }

  private showAbility(event: Extract<GameEvent, { k: "ability" }>, now: number): void {
    const fx = this.renderer.effects;
    this.renderer.cast(event.hero, event.slot, now);
    const effect = content.abilities[event.slot]?.effect;
    if (effect === "nova") {
      fx.ring(event.x, event.y, event.radius, [1, 0.6, 0.25], 550, now);
      fx.explosion(event.x, event.y, event.radius * 0.7, [1, 0.75, 0.35], now);
    } else if (effect === "buff") {
      fx.ring(event.x, event.y, event.radius, [0.55, 1, 0.45], 650, now);
      fx.beam(event.x, event.y, [0.55, 1, 0.45], now);
    } else if (effect === "strike") {
      fx.marker(event.x, event.y, event.radius, event.delayTicks * this.world.tickMs, now);
    }
    const sound = effect && ABILITY_SOUNDS[effect];
    if (sound) audio.playAt(sound, event.x, event.y);
  }

  /** Weapon sounds for melee units in their attack stance, once per attack cooldown: hits are not sent as events. */
  snapshot(now: number): void {
    const attackers: Swinger[] = [];
    for (const entity of this.world.entities.values()) {
      if (entity.info.category !== "unit" || entity.state !== Activity.Attack || entity.info.def.range > MELEE_REACH) continue;
      attackers.push({ id: entity.id, cooldownMs: (entity.info.def.cooldown * MS_PER_SECOND) / entity.attackSpeed });
    }
    for (const id of this.swings.due(attackers, now, Math.random)) {
      const unit = this.world.entities.get(id)!;
      audio.playAt(this.nearestEnemy(unit)?.info.category === "building" ? "chop" : "clash", unit.x, unit.y);
    }
  }

  /** The enemy closest to a unit's reach, which is what a melee unit in its attack stance is striking. */
  private nearestEnemy(unit: WorldEntity): WorldEntity | undefined {
    let nearest: WorldEntity | undefined;
    let best = Infinity;
    for (const other of this.world.entities.values()) {
      if (other.info.category === "node" || other.ghost || !this.areEnemies(unit.owner, other.owner)) continue;
      const edge = other.info.category === "building" ? footprintSize(other.info) / 2 : 0;
      const distance = Math.hypot(other.x - unit.x, other.y - unit.y) - edge;
      if (distance < best) {
        best = distance;
        nearest = other;
      }
    }
    return nearest;
  }

  private areEnemies(a: number, b: number): boolean {
    if (a === b) return false;
    return a === NEUTRAL_OWNER || b === NEUTRAL_OWNER || this.world.teamOf(a) !== this.world.teamOf(b);
  }
}

function isCreep(kind: number): boolean {
  const info = kindInfo(kind);
  return info?.category === "unit" && info.def.tags.includes("creep");
}
