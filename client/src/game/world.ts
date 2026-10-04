import { footprintSize, kindInfo, sightOf, type KindInfo } from "../content/content";
import { Flags, NEUTRAL_OWNER, Tile, type EntityRecord, type GameEvent, type PlayerView, type SnapshotFrame, type WelcomeMessage } from "../net/protocol";
import { MotionTrack, SnapshotClock, type MotionSample } from "./motion";
import { FogGrid } from "./vision";

/** Farther than this between snapshots is a respawn or spawn, so the entity snaps instead of sliding. */
const SNAP_DISTANCE = 3;
/** Units render this far behind the newest snapshot beyond one tick, so a slightly late snapshot still lands in time. */
const JITTER_MARGIN_MS = 30;
/** A snapshot later than the margin lets a unit coast along its last step for at most this long. */
const MAX_EXTRAPOLATION_MS = 100;

export interface WorldEntity {
  id: number;
  kind: number;
  info: KindInfo;
  owner: number;
  x: number;
  y: number;
  /** Where to draw the entity now; units trail their newest snapshot slightly, see ClientWorld.interpolate. */
  renderX: number;
  renderY: number;
  /** A unit's facing and activity at its render position, matching the motion it is drawn in. */
  renderFacing: number;
  renderState: number;
  /** A unit's recent snapshots; undefined for buildings and nodes, which never move. */
  track?: MotionTrack;
  hp: number;
  maxHp: number;
  state: number;
  facing: number;
  extra: number;
  flags: number;
  /** How much faster than its base cooldown the unit attacks now; 1 for buildings and nodes. */
  attackSpeed: number;
  /** A building's upgrade level, a hero's level or a trained unit's rank, from 1; 1 for everything else. */
  level: number;
  /** A building mid-upgrade. */
  upgrading: boolean;
  /** Upgrade percent done, 0 to 100, while upgrading. */
  upgradeProgress: number;
  /** Last-known building or node the viewer can no longer see. */
  ghost: boolean;
}

/** The level, upgrade state and progress a snapshot record carries for its kind. */
export function levelFields(record: EntityRecord, info: KindInfo): Pick<WorldEntity, "level" | "upgrading" | "upgradeProgress"> {
  if (info.category === "building") {
    const upgrading = (record.flags & Flags.Upgrading) !== 0;
    return { level: Math.max(1, record.state), upgrading, upgradeProgress: upgrading ? record.extra : 0 };
  }
  // A unit's extra is its hero level, else its rank unless it carries a load there instead.
  const hero = (record.flags & Flags.Hero) !== 0;
  const ranked = info.category === "unit" && (hero || (record.flags & Flags.Carrying) === 0);
  return { level: ranked ? Math.max(1, record.extra) : 1, upgrading: false, upgradeProgress: 0 };
}

/** Sight of a snapshot record; a building's grows with its level. */
export function recordSight(record: EntityRecord): number {
  const info = kindInfo(record.kind);
  if (!info) return 0;
  return sightOf(info, info.category === "building" ? record.state : 1);
}

export interface TileChange {
  x: number;
  y: number;
  tile: number;
}

/** The viewer's picture of the match: map, last-known entities, fog and interpolation state. */
export class ClientWorld {
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint8Array;
  readonly fog: FogGrid;
  readonly entities = new Map<number, WorldEntity>();
  readonly tickMs: number;
  you: number;
  players: PlayerView[];
  tick: number;
  tilesVersion = 0;
  pendingTileChanges: TileChange[] = [];
  private readonly clock: SnapshotClock;
  private readonly sample: MotionSample = { t: 0, x: 0, y: 0, facing: 0, state: 0 };

  constructor(welcome: WelcomeMessage) {
    this.width = welcome.map.width;
    this.height = welcome.map.height;
    this.tiles = decodeTiles(welcome.map.tiles);
    this.fog = new FogGrid(this.width, this.height, (x, y) => this.tile(x, y) === Tile.Tree);
    this.tickMs = 1000 / welcome.tickRate;
    this.clock = new SnapshotClock(this.tickMs, this.tickMs + JITTER_MARGIN_MS);
    this.you = welcome.you;
    this.players = welcome.players;
    this.tick = welcome.tick;
  }

  get myTeam(): number {
    return this.teamOf(this.you);
  }

  /** The hero a player leads, from the latest roster. */
  heroOf(owner: number): string | undefined {
    return this.players.find((p) => p.index === owner)?.hero;
  }

  teamOf(owner: number): number {
    return this.players.find((p) => p.index === owner)?.team ?? -1;
  }

  isMine(owner: number): boolean {
    return owner === this.you;
  }

  isAlly(owner: number): boolean {
    return owner !== NEUTRAL_OWNER && this.teamOf(owner) === this.myTeam;
  }

  isHostile(entity: WorldEntity): boolean {
    if (entity.owner === NEUTRAL_OWNER) return entity.info.category === "unit";
    return !this.isAlly(entity.owner);
  }

  tile(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return Tile.Water;
    return this.tiles[y * this.width + x]!;
  }

  applySnapshot(frame: SnapshotFrame, now: number): void {
    if (frame.tick < this.tick) return;
    this.fallen.clear();
    this.tick = frame.tick;
    this.clock.arrived(frame.tick, now);
    const time = frame.tick * this.tickMs;
    const seen = new Set<number>();
    for (const record of frame.entities) {
      seen.add(record.id);
      this.upsert(record, time);
    }
    this.fog.update(frame.entities, (owner) => this.isAlly(owner), recordSight);
    for (const entity of this.entities.values()) {
      if (!seen.has(entity.id)) this.forget(entity);
    }
  }

  /**
   * Entities removed since the latest snapshot, so a death event's presenter can still read what they were. The
   * server drops a dead entity from that tick's snapshot, which arrives before the tick's events.
   */
  readonly fallen = new Map<number, WorldEntity>();

  applyEvents(events: GameEvent[]): void {
    for (const event of events) {
      if (event.k === "tiles") {
        for (const [x, y, tile] of event.changes) {
          this.tiles[y * this.width + x] = tile;
          this.pendingTileChanges.push({ x, y, tile });
        }
        this.tilesVersion++;
      } else if (event.k === "death") {
        const entity = this.entities.get(event.id);
        if (entity) this.remove(entity);
      }
    }
  }

  /**
   * Places every unit where its snapshots say it was a little over one tick ago, between the two samples around
   * that moment, so motion stays even however unevenly snapshots arrive. Buildings and nodes stand where they are.
   */
  interpolate(now: number): void {
    const t = this.clock.renderTime(now);
    for (const entity of this.entities.values()) {
      if (!entity.track) continue;
      const at = entity.track.at(t, MAX_EXTRAPOLATION_MS, this.sample);
      entity.renderX = at.x;
      entity.renderY = at.y;
      entity.renderFacing = at.facing;
      entity.renderState = at.state;
    }
  }

  footprint(entity: WorldEntity): { x: number; y: number; size: number } {
    const size = footprintSize(entity.info);
    if (entity.info.category === "unit") return { x: Math.floor(entity.x), y: Math.floor(entity.y), size: 1 };
    return { x: Math.round(entity.x - size / 2), y: Math.round(entity.y - size / 2), size };
  }

  isUnderConstruction(entity: WorldEntity): boolean {
    return (entity.flags & Flags.UnderConstruction) !== 0;
  }

  carryType(entity: WorldEntity): number {
    return (entity.flags >> 2) & 3;
  }

  /** Building, node or ghost covering a tile, used by placement checks. */
  blockerAt(x: number, y: number): WorldEntity | undefined {
    for (const entity of this.entities.values()) {
      if (entity.info.category === "unit") continue;
      const f = this.footprint(entity);
      if (x >= f.x && y >= f.y && x < f.x + f.size && y < f.y + f.size) return entity;
    }
    return undefined;
  }

  private upsert(record: EntityRecord, time: number): void {
    const info = kindInfo(record.kind);
    if (!info) return;
    const sample = { t: time, x: record.x, y: record.y, facing: record.facing, state: record.state };
    const existing = this.entities.get(record.id);
    if (!existing) {
      const track = info.category === "unit" ? new MotionTrack() : undefined;
      track?.push(sample, true);
      this.entities.set(record.id, {
        ...record,
        ...levelFields(record, info),
        info,
        renderX: record.x,
        renderY: record.y,
        renderFacing: record.facing,
        renderState: record.state,
        track,
        ghost: false,
      });
      return;
    }
    const last = existing.track?.latest;
    existing.track?.push(sample, last !== undefined && Math.hypot(record.x - last.x, record.y - last.y) > SNAP_DISTANCE);
    Object.assign(existing, record, levelFields(record, info), { info, ghost: false });
    if (!existing.track) {
      existing.renderX = record.x;
      existing.renderY = record.y;
    }
  }

  private remove(entity: WorldEntity): void {
    this.entities.delete(entity.id);
    this.fallen.set(entity.id, entity);
  }

  /** Units vanish when unseen; buildings and nodes stay as ghosts until their footprint is in sight again. */
  private forget(entity: WorldEntity): void {
    if (entity.info.category === "unit" || this.isAlly(entity.owner)) {
      this.remove(entity);
      return;
    }
    const f = this.footprint(entity);
    if (this.fog.isRectVisible(f.x, f.y, f.size)) {
      this.remove(entity);
      return;
    }
    entity.ghost = true;
    entity.renderX = entity.x;
    entity.renderY = entity.y;
  }
}

function decodeTiles(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
