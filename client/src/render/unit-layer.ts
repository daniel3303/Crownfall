import { Constants } from "@babylonjs/core/Engines/constants";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import type { Scene } from "@babylonjs/core/scene";
import { kindInfo, kinds, type UnitDef } from "../content/content";
import type { ClientWorld, WorldEntity } from "../game/world";
import { Activity } from "../net/protocol";
import { InstanceBatch } from "./batch";
import type { SceneLighting } from "./lighting";
import { hash2, type TileGrid } from "./terrain-field";
import { Animator, attackRate, moveRate, type PlayOptions, RATE_SPREAD, stillMoving, turnStep, turnToward } from "./unit-animation";
import { type GroundSample, shadowStrength, UnitGround } from "./unit-ground";
import { byModel, TEAM_COLOR, type UnitModel } from "./unit-models";
import { VAT_BLEND } from "./vat-blend";
import { rowCount, rowOffset, type Clip } from "./vat-clock";

const VAT = "bakedVertexAnimationSettingsInstanced";
/** The characters face +Z; game facing 0 points along +X. */
const FACING_OFFSET = Math.PI / 2;
const CORPSE_SINK_MS = 7000;
const CORPSE_GONE_MS = 10000;
const CORPSE_SINK_DEPTH = 0.6;
const FOOD = 0;
const PRUNE_FRAMES = 300;
/** Longest frame step the animation and turning take, so a stalled tab does not jump a whole clip. */
const MAX_FRAME_SECONDS = 0.1;
/** Smoothing time of the measured ground speed that drives the move clip. */
const SPEED_SMOOTHING_SECONDS = 0.15;
/** Slower than this a unit counts as standing still. */
const MOVING_SPEED = 0.3;
/** Contact-shadow diameter per unit of collision radius, and its darkness at the centre. */
const SHADOW_SCALE = 2.2;
const SHADOW_OPACITY = 0.65;
const SHADOW_LIFT = 0.02;
const SHADOW_TEXTURE_SIZE = 64;
/** Ground speed of the human jog, troll lurch and wolf gallop in model units per second, measured on the built models' planted feet. */
const JOG_SPEED = 6.27;
const LURCH_SPEED = 1.04;
const GALLOP_SPEED = 10.1;
/** The knight's horse gallop, measured on its planted hooves. */
const HORSE_GALLOP_SPEED = 10.7;
/** The dragon hovers on the move with its idle flight, so this paces its wingbeat rather than any footfall. */
const FLIGHT_SPEED = 4;
/**
 * Camera distance under which the shader blends neighbouring animation rows. Farther out the 30 Hz steps are too
 * small to see, so the second set of bone reads is skipped.
 */
const SMOOTH_RADIUS = 22;
/** Seed salts for per-unit variation. */
const PHASE_SALT = 11;
const RATE_SALT = 13;
const LOOK_SALT = 17;

interface Look {
  scale: number;
  /** Ground speed of the move clip at scale 1, so the feet keep pace with the unit. */
  stride: number;
  idle: string;
  move: string;
  attack: string;
  death: string;
  dead: string;
  /** Villager chores; carrying food plays the second clip. */
  work?: [string, string];
  /** Hero ability clips by slot. */
  casts?: string[];
  /** How far its idle and move clips rise above the bind pose, as a factor of its height (a dragon's wingbeat). */
  top?: number;
}

/** Clip names follow the roles the asset build gives them (tools/assets/characters.mjs). */
const ROLES = { idle: "Idle", move: "Move", attack: "Attack", death: "Death", dead: "Dead" };
const HUMAN = { stride: JOG_SPEED, ...ROLES };
const HERO = { ...HUMAN, scale: 0.84, casts: ["Cast0", "Cast1", "Cast2", "Cast3"] };

/** Which baked clip each character model plays per activity, and how big it stands next to the buildings. */
export const LOOKS: Record<string, Look> = {
  villager: { ...HUMAN, scale: 0.62, work: ["Work", "Harvest"] },
  spearman: { ...HUMAN, scale: 0.67 },
  archer: { ...HUMAN, scale: 0.66 },
  rider: { ...HUMAN, scale: 0.69 },
  paladin: HERO,
  warchief: HERO,
  archmage: HERO,
  ranger: HERO,
  shaman: HERO,
  blademaster: HERO,
  berserker: { ...HUMAN, scale: 0.72 },
  wolf: { ...ROLES, stride: GALLOP_SPEED, scale: 0.3 },
  troll: { ...ROLES, stride: LURCH_SPEED, scale: 1.15 },
  // About 3.2 tiles of wingspan in flight.
  dragon: { ...ROLES, stride: FLIGHT_SPEED, scale: 0.55, top: 1.15 },
  // Horse units: the rider is modelled 2.25 times larger than on foot, so this matches the footmen's scale.
  knight: { ...ROLES, stride: HORSE_GALLOP_SPEED, scale: 0.31 },
};

/** What the layer remembers about a drawn unit between frames. */
interface UnitState {
  animator: Animator;
  facing: number;
  x: number;
  y: number;
  /** Smoothed ground speed of the render position. */
  speed: number;
  lastMovedMs: number;
  /** A hero ability slot whose clip is playing, and whether it has yet to start. */
  cast: number | null;
  castPending: boolean;
  /** The frame it was last drawn in. */
  seen: number;
}

interface Corpse {
  id: number;
  kind: number;
  owner: number;
  x: number;
  y: number;
  facing: number;
  since: number;
  animator: Animator;
}

interface KindDraw {
  model: UnitModel;
  look: Look;
  batch: InstanceBatch;
}

/** Animated characters drawn with thin instances; each instance's clip row is chosen here every frame. */
export class UnitLayer {
  /** By kind index; kinds sharing a model share one entry of `draws`. */
  private readonly kinds: KindDraw[];
  private readonly draws: KindDraw[];
  private readonly shadows: InstanceBatch;
  private readonly states = new Map<number, UnitState>();
  private readonly corpses: Corpse[] = [];
  private readonly local = new Matrix();
  private readonly conjugated = new Matrix();
  private readonly instance = new Matrix();
  private readonly scale = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly position = new Vector3();
  private now = 0;
  private seconds = 0;
  private frame = 0;
  private smooth = true;
  /** Uncapped seconds since the last frame, for measuring speed. */
  private elapsed = 0;
  /** Reused every frame for each unit's looping clip. */
  private readonly looping: PlayOptions = { loop: true, rate: 1, row: 0 };
  /** The ground units stand on, built for the map the first time a unit is drawn on it. */
  private ground: UnitGround | null = null;
  private groundMap: TileGrid | null = null;
  private readonly under: GroundSample = { height: 0, slopeX: 0, slopeY: 0 };
  /** For `standAt`, which other layers call. */
  private readonly probe: GroundSample = { height: 0, slopeX: 0, slopeY: 0 };
  private readonly normal = new Vector3();

  constructor(
    private readonly scene: Scene,
    models: Map<string, UnitModel>,
    lighting: SceneLighting,
    private readonly ownerColor: (owner: number) => [number, number, number],
  ) {
    // Kinds that borrow another's model share its draw: one mesh carries one set of thin instances.
    const units = kinds.flatMap((kind) => (kind.category === "unit" ? [kind] : []));
    const { byKind, models: draws } = byModel(units, (id, def) => {
      const model = models.get(id);
      const look = LOOKS[id];
      if (!model || !look) throw new Error(`No character ${id} for ${def.id}`);
      for (const clip of [look.idle, look.move, look.attack, look.death, look.dead, ...(look.work ?? []), ...(look.casts ?? [])]) {
        if (!model.clips.has(clip)) throw new Error(`${id} has no clip ${clip}`);
      }
      lighting.addCaster(model.mesh);
      return { model, look, batch: new InstanceBatch(model.mesh, { [VAT]: 4, [VAT_BLEND]: 4, [TEAM_COLOR]: 4 }) };
    });
    this.kinds = byKind;
    this.draws = draws;
    this.shadows = new InstanceBatch(createContactShadow(scene), { color: 4 });
  }

  /** The ground a unit's feet stand on at a map point: level at 0 on land, lower on a beach or wading in the shallows. */
  groundAt(x: number, y: number): Readonly<GroundSample> {
    if (this.ground) return this.ground.sample(x, y, this.probe);
    this.probe.height = this.probe.slopeX = this.probe.slopeY = 0;
    return this.probe;
  }

  heightOf(kind: number): number | undefined {
    const draw = this.kinds[kind];
    return draw ? draw.model.height * draw.look.scale * (draw.look.top ?? 1) : undefined;
  }

  /** Plays a hero's ability clip once. */
  cast(heroId: number, slot: number, _now: number): void {
    const state = this.states.get(heroId);
    if (!state) return;
    state.cast = slot;
    state.castPending = true;
  }

  /** Leaves a body where the unit was last drawn: it fades into its death clip, lies still, then sinks away. */
  addCorpse(id: number, kind: number, owner: number, x: number, y: number, now: number): void {
    const draw = this.kinds[kind];
    if (kindInfo(kind)?.category !== "unit" || !draw) return;
    const state = this.states.get(id);
    // The unit is drawn a little behind its snapshots; fall where it stood on screen unless that is far off.
    const near = state !== undefined && Math.hypot(state.x - x, state.y - y) < 2;
    const animator = new Animator();
    animator.play(draw.look.death, this.clip(draw, draw.look.death), { loop: false, rate: 1, cut: true });
    if (state) animator.inherit(state.animator);
    this.corpses.push({ id, kind, owner, x: near ? state.x : x, y: near ? state.y : y, facing: state?.facing ?? 0, since: now, animator });
    this.states.delete(id);
  }

  begin(now: number): void {
    this.elapsed = this.now === 0 ? 0 : Math.max(0, (now - this.now) / 1000);
    this.seconds = Math.min(MAX_FRAME_SECONDS, this.elapsed);
    this.now = now;
    const radius = (this.scene.activeCamera as { radius?: number } | null)?.radius;
    this.smooth = radius === undefined || radius < SMOOTH_RADIUS;
    for (const draw of this.draws) draw.batch.begin();
    this.shadows.begin();
  }

  draw(world: ClientWorld, entity: WorldEntity): void {
    const draw = this.kinds[entity.kind];
    const info = entity.info;
    if (!draw || info.category !== "unit") return;
    const state = this.stateOf(entity);
    this.track(state, entity);
    this.animate(world, entity, info.def, draw, state);
    const ground = this.groundOf(world).sample(entity.renderX, entity.renderY, this.under);
    this.push(draw, entity.id, entity.owner, state.animator, entity.renderX, entity.renderY, state.facing, ground.height);
    this.shadow(entity.renderX, entity.renderY, info.def.radius, 1, ground);
  }

  end(world: ClientWorld): void {
    this.drawCorpses(world);
    for (const draw of this.draws) draw.batch.end();
    this.shadows.end();
    this.forgetGone(world);
  }

  private stateOf(entity: WorldEntity): UnitState {
    let state = this.states.get(entity.id);
    if (!state) {
      state = { animator: new Animator(), facing: entity.renderFacing, x: entity.renderX, y: entity.renderY, speed: 0, lastMovedMs: -Infinity, cast: null, castPending: false, seen: this.frame };
      this.states.set(entity.id, state);
    } else if (state.seen < this.frame - 1) {
      // Back in sight after a while: start from where it is now rather than sliding or spinning from where it was.
      Object.assign(state, { facing: entity.renderFacing, x: entity.renderX, y: entity.renderY, speed: 0 });
    }
    state.seen = this.frame;
    return state;
  }

  /** Measures how fast the unit moves on screen and turns it toward its facing at a capped rate. */
  private track(state: UnitState, entity: WorldEntity): void {
    if (this.elapsed > 0) {
      const instant = Math.hypot(entity.renderX - state.x, entity.renderY - state.y) / this.elapsed;
      state.speed += (instant - state.speed) * Math.min(1, this.elapsed / SPEED_SMOOTHING_SECONDS);
    }
    state.x = entity.renderX;
    state.y = entity.renderY;
    if (entity.renderState === Activity.Move || state.speed > MOVING_SPEED) state.lastMovedMs = this.now;
    state.facing = turnToward(state.facing, entity.renderFacing, turnStep(this.seconds));
  }

  private animate(world: ClientWorld, entity: WorldEntity, def: UnitDef, draw: KindDraw, state: UnitState): void {
    const { look } = draw;
    const animator = state.animator;
    const castClip = state.cast !== null && look.casts ? (look.casts[state.cast] ?? look.casts[0]!) : null;
    if (!castClip) {
      state.cast = null;
    } else if (state.castPending) {
      animator.play(castClip, this.clip(draw, castClip), { loop: false, rate: 1, restart: true });
      state.castPending = false;
    } else if (animator.done) {
      state.cast = null;
    }
    if (state.cast === null) {
      const name = this.clipFor(world, entity, look, state);
      const clip = this.clip(draw, name);
      const spread = 1 + (hash2(entity.id, RATE_SALT) - 0.5) * RATE_SPREAD;
      const options = this.looping;
      if (name === look.move) {
        options.rate = moveRate(state.speed, look.stride, look.scale) * spread;
        options.row = this.phase(entity.id, clip);
      } else if (name === look.attack) {
        // One swing per attack interval, starting at the wind-up when the unit engages.
        options.rate = attackRate(clip.seconds, def.cooldown, entity.attackSpeed);
        options.row = 0;
      } else {
        options.rate = spread;
        options.row = this.phase(entity.id, clip);
      }
      animator.play(name, clip, options);
    }
    animator.advance(this.seconds);
  }

  private clipFor(world: ClientWorld, entity: WorldEntity, look: Look, state: UnitState): string {
    switch (entity.renderState) {
      case Activity.Attack:
        return look.attack;
      case Activity.Gather:
      case Activity.Build:
        if (!look.work) return look.attack;
        return entity.renderState === Activity.Gather && world.carryType(entity) === FOOD ? look.work[1] : look.work[0];
      default:
        return stillMoving(entity.renderState === Activity.Move, state.lastMovedMs, this.now) ? look.move : look.idle;
    }
  }

  /** Where a looping clip starts for this unit, so a group ordered together does not step in unison. */
  private phase(id: number, clip: Clip): number {
    return hash2(id, PHASE_SALT) * rowCount(clip);
  }

  private clip(draw: KindDraw, name: string): Clip {
    return draw.model.clips.get(name)!;
  }

  private groundOf(map: TileGrid): UnitGround {
    if (this.groundMap !== map || !this.ground) {
      this.ground = new UnitGround(map);
      this.groundMap = map;
    }
    return this.ground;
  }

  private drawCorpses(world: ClientWorld): void {
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const corpse = this.corpses[i]!;
      const age = this.now - corpse.since;
      const draw = this.kinds[corpse.kind];
      if (!draw || age > CORPSE_GONE_MS) {
        this.corpses.splice(i, 1);
        continue;
      }
      const animator = corpse.animator;
      animator.advance(this.seconds);
      // The dead pose is the frame right after the death clip's last baked row, so the switch needs no fade.
      if (animator.name === draw.look.death && animator.done) animator.play(draw.look.dead, this.clip(draw, draw.look.dead), { loop: false, rate: 1, cut: true });
      const sinking = age > CORPSE_SINK_MS ? (age - CORPSE_SINK_MS) / (CORPSE_GONE_MS - CORPSE_SINK_MS) : 0;
      const ground = this.groundOf(world).sample(corpse.x, corpse.y, this.under);
      this.push(draw, corpse.id, corpse.owner, animator, corpse.x, corpse.y, corpse.facing, ground.height - sinking * CORPSE_SINK_DEPTH);
      const info = kindInfo(corpse.kind);
      this.shadow(corpse.x, corpse.y, info?.category === "unit" ? info.def.radius : 0.3, 1 - sinking, ground);
    }
  }

  /** Writes one instance: map transform conjugated by the model's mirrored root, its rows and its owner colour. */
  private push(draw: KindDraw, id: number, owner: number, animator: Animator, x: number, y: number, facing: number, lift: number): void {
    const { model, look, batch } = draw;
    const pose = animator.pose;
    if (!pose) return;
    const s = look.scale;
    this.scale.set(s, s, s);
    Quaternion.RotationYawPitchRollToRef(facing + FACING_OFFSET, 0, 0, this.rotation);
    this.position.set(x, lift, -y);
    Matrix.ComposeToRef(this.scale, this.rotation, this.position, this.local);
    model.world.multiplyToRef(this.local, this.conjugated);
    this.conjugated.multiplyToRef(model.inverse, this.instance);
    const slot = batch.push(this.instance);
    // A whole row skips the blend toward the next one in the shader.
    batch.write(VAT, slot, pose.clip.start, pose.clip.end, rowOffset(pose.clip, this.smooth ? pose.row : Math.floor(pose.row)), 0);
    const fading = animator.fading;
    if (fading) batch.write(VAT_BLEND, slot, fading.clip.start, rowOffset(fading.clip, fading.row), animator.fadeWeight, 0);
    else batch.write(VAT_BLEND, slot, 0, 0, 0, 0);
    const [r, g, b] = this.ownerColor(owner);
    batch.write(TEAM_COLOR, slot, r, g, b, hash2(id, LOOK_SALT));
  }

  /** A soft dark patch under the unit, so it stands on the ground rather than floating over it; none under water. */
  private shadow(x: number, y: number, radius: number, opacity: number, ground: GroundSample): void {
    const strength = opacity * shadowStrength(ground.height);
    if (strength <= 0) return;
    const size = radius * SHADOW_SCALE;
    this.scale.set(size, 1, size);
    // Tilted to the slope (map y runs along -Z), so a beach does not bury half of it.
    this.normal.set(-ground.slopeX, 1, ground.slopeY).normalize();
    Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, this.normal, this.rotation);
    this.position.set(x, ground.height + SHADOW_LIFT, -y);
    Matrix.ComposeToRef(this.scale, this.rotation, this.position, this.local);
    this.shadows.pushColored(this.local, 1, 1, 1, strength);
  }

  /** Now and then drops the state of units that left the world without a death (out of sight). */
  private forgetGone(world: ClientWorld): void {
    if (++this.frame % PRUNE_FRAMES !== 0) return;
    for (const id of this.states.keys()) {
      if (!world.entities.has(id)) this.states.delete(id);
    }
  }
}

/** A ground quad with a radial falloff: dark under the feet, gone at the rim. */
function createContactShadow(scene: Scene) {
  const n = SHADOW_TEXTURE_SIZE;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const r = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2;
      // Steeper than a smoothstep: dense under the feet, so it reads as contact rather than a disc.
      const falloff = Math.max(0, 1 - r) ** 1.5;
      data[(y * n + x) * 4 + 3] = Math.round(255 * SHADOW_OPACITY * falloff * falloff * (3 - 2 * falloff));
    }
  }
  const texture = RawTexture.CreateRGBATexture(data, n, n, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE, Constants.TEXTURETYPE_UNSIGNED_BYTE);
  texture.hasAlpha = true;
  const quad = CreateGround("contact-shadow", { width: 1, height: 1 }, scene);
  const material = new StandardMaterial("contact-shadow", scene);
  material.diffuseTexture = texture;
  material.useAlphaFromDiffuseTexture = true;
  material.disableLighting = true;
  material.emissiveColor = Color3.Black();
  material.diffuseColor = Color3.Black();
  material.specularColor = Color3.Black();
  material.disableDepthWrite = true;
  quad.material = material;
  return quad;
}
