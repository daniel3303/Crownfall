/** Wire types shared with Crownfall.Server. Text frames are camelCase JSON; snapshots are binary. */

export const SNAPSHOT_TYPE = 1;
export const SNAPSHOT_VERSION = 2;
export const NEUTRAL_OWNER = 255;
const HEADER_SIZE = 8;
const RECORD_SIZE = 19;
/** Attack speed travels as its multiplier × 64. */
const ATTACK_SPEED_SCALE = 64;
const POSITION_SCALE = 256;

export const Flags = {
  UnderConstruction: 1,
  Carrying: 2,
  Buffed: 16,
  Training: 32,
  Hero: 64,
  /** A building mid-upgrade: its extra byte is the upgrade's percent done. */
  Upgrading: 128,
} as const;

export const Activity = { Idle: 0, Move: 1, Attack: 2, Gather: 3, Build: 4 } as const;

/** Map tiles; Shallow is a lake's wadeable rim, walked on and built on only by walls. */
export const Tile = { Grass: 0, Sand: 1, Water: 2, Tree: 3, Shallow: 4 } as const;

/** Water to look at, deep or shallow. */
export function isWaterTile(tile: number): boolean {
  return tile === Tile.Water || tile === Tile.Shallow;
}

export interface EntityRecord {
  id: number;
  kind: number;
  owner: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: number;
  facing: number;
  extra: number;
  flags: number;
  /** How much faster than its base cooldown the unit attacks now (Rally, attack-speed ranks); 1 for buildings and nodes. */
  attackSpeed: number;
}

export interface SnapshotFrame {
  tick: number;
  entities: EntityRecord[];
}

export function decodeSnapshot(buffer: ArrayBuffer): SnapshotFrame {
  const view = new DataView(buffer);
  if (view.getUint8(0) !== SNAPSHOT_TYPE || view.getUint8(1) !== SNAPSHOT_VERSION) {
    throw new Error("Unsupported snapshot format");
  }
  const tick = view.getUint32(2, true);
  const count = view.getUint16(6, true);
  const entities: EntityRecord[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = HEADER_SIZE + i * RECORD_SIZE;
    entities[i] = {
      id: view.getUint32(o, true),
      kind: view.getUint8(o + 4),
      owner: view.getUint8(o + 5),
      x: view.getUint16(o + 6, true) / POSITION_SCALE,
      y: view.getUint16(o + 8, true) / POSITION_SCALE,
      hp: view.getUint16(o + 10, true),
      maxHp: view.getUint16(o + 12, true),
      state: view.getUint8(o + 14),
      facing: (view.getUint8(o + 15) / 256) * Math.PI * 2,
      extra: view.getUint8(o + 16),
      flags: view.getUint8(o + 17),
      attackSpeed: view.getUint8(o + 18) / ATTACK_SPEED_SCALE,
    };
  }
  return { tick, entities };
}

export type Sharing = "separate" | "separateWithTribute" | "shared";
/** `passive` is the tutorial's bot, which never leaves home; the lobby picker does not offer it. */
export type Difficulty = "easy" | "normal" | "hard" | "brutal" | "passive";
export type MapSizeName = "small" | "medium" | "large";

export interface MatchConfig {
  teams: number;
  playersPerTeam: number;
  sharing: Sharing;
  difficulty: Difficulty;
  mapSize: MapSizeName;
  seed?: number;
}

export interface MatchSummary {
  id: string;
  phase: string;
  isQuickPlay: boolean;
  hostName?: string;
  humans: number;
  openSeats: number;
  seats: number;
  config: MatchConfig;
}

export interface SeatView {
  index: number;
  team: number;
  name: string;
  race: string;
  isBot: boolean;
  isHost: boolean;
}

export interface PlayerView {
  index: number;
  name: string;
  team: number;
  race: string;
  isBot: boolean;
  defeated: boolean;
  score: number;
}

export interface LobbyMessage {
  t: "lobby";
  matchId: string;
  phase: string;
  you: number;
  config: MatchConfig;
  seats: SeatView[];
}

export interface WelcomeMessage {
  t: "welcome";
  matchId: string;
  you: number;
  config: MatchConfig;
  tickRate: number;
  tick: number;
  players: PlayerView[];
  map: { width: number; height: number; tiles: string };
}

/** The hero's effective numbers right now: level growth, stat ranks and any Rally buff applied. */
export interface HeroStats {
  hp: number;
  maxHp: number;
  attack: number;
  /** Seconds between basic attacks. */
  cooldown: number;
  range: number;
  speed: number;
  armorMelee: number;
  armorPierce: number;
  /** Share of basic-attack damage healed back, 0 to 1. */
  lifeSteal: number;
  sight: number;
  /** Hp per second: items always, plus resting regeneration while untouched. */
  regen: number;
  regenerating: boolean;
}

export interface HeroState {
  /** 0 while the hero is fallen. */
  id: number;
  unit: string;
  level: number;
  xp: number;
  xpLevelStart: number;
  xpNextLevel: number;
  cooldowns: number[];
  unspentPoints: number;
  /** Ranks per hero stat, in content order. */
  ranks: number[];
  /** Seconds until a fallen hero may be revived. */
  reviveSeconds: number;
  /** Down, cooldown over and a completed town center stands; affordability is checked against the stock. */
  canRevive: boolean;
  reviveCost: number[];
  /** Item id per inventory slot, null where empty. */
  items: (string | null)[];
  /** The living hero stands near an own completed town center, where items are traded. */
  canShop: boolean;
  /** Enemy heroes slain since it last died. */
  streak: number;
  /** What ability cooldowns are multiplied by now, from level and items. */
  cooldownFactor: number;
  stats: HeroStats;
}

/** The center dragon's timer and your team's buff from slaying it. */
export interface DragonState {
  isUp: boolean;
  /** Seconds until it lands; 0 while up. */
  landsInSeconds: number;
  /** Seconds your attack buff has left; 0 without one. */
  buffSeconds: number;
}

export interface ProductionState {
  id: number;
  queue: string[];
  progress: number;
}

export interface StateMessage {
  t: "state";
  tick: number;
  elapsedSeconds: number;
  resources: number[];
  /** Storage cap per resource; income past it is lost. */
  storage: number[];
  /** Your best completed town center level, which gates some upgrades; 0 without one. */
  townCenterLevel: number;
  market: MarketPrices;
  population: number;
  populationCap: number;
  hero: HeroState;
  /** Absent when the rules have no dragon. */
  dragon?: DragonState;
  production: ProductionState[];
  players: PlayerView[];
}

/** Your market prices in gold per lot, by resource; 0 where the market does not trade. */
export interface MarketPrices {
  lot: number;
  buy: number[];
  sell: number[];
}

export type GameEvent =
  | { k: "shot"; from: number; to: number; x: number; y: number; tx: number; ty: number; ticks: number }
  | { k: "death"; id: number; owner: number; entityKind: number; x: number; y: number; category: "unit" | "building" | "node" }
  | { k: "deposit"; player: number; x: number; y: number; resource: string; amount: number }
  | { k: "ability"; player: number; team: number; hero: number; slot: number; x: number; y: number; radius: number; delayTicks: number }
  | { k: "levelUp"; player: number; team: number; hero: number; level: number; x: number; y: number }
  | { k: "notice"; player: number; text: string; tone: "info" | "warning" | "alert" | "success"; hasPosition: boolean; x: number; y: number }
  | { k: "tiles"; changes: [number, number, number][] }
  | { k: "defeat"; player: number; name: string }
  | { k: "completed"; player: number; id: number; what: string }
  | { k: "upgraded"; player: number; team: number; id: number; what: string; level: number; x: number; y: number }
  | { k: "impact"; team: number; x: number; y: number; radius: number }
  | { k: "announce"; type: AnnouncementType; title: string; text: string; player: number; team: number; x: number; y: number };

/** Match-wide calls every player hears; player and team are -1 when no one owns one. */
export type AnnouncementType = "firstBlood" | "killStreak" | "shutdown" | "dragonSpawned" | "dragonSlain";

export interface EventsMessage {
  t: "events";
  tick: number;
  events: GameEvent[];
}

export interface EndPlayer {
  index: number;
  name: string;
  team: number;
  isBot: boolean;
  score: number;
  gathered: number;
  kills: number;
  losses: number;
  unitsTrained: number;
  heroLevel: number;
  /** Soldiers trained, villagers excluded. */
  soldiersTrained: number;
  buildingsBuilt: number;
  /** Enemy heroes this player slew. */
  heroKills: number;
  /** Times this player's own hero fell. */
  heroDeaths: number;
}

/** One player's samples, aligned with `MatchTimeline.seconds`. */
export interface PlayerTimeline {
  index: number;
  /** Living soldiers, heroes excluded. */
  army: number[];
  gathered: number[];
  score: number[];
}

/** Stats the server sampled through the match: every `intervalSeconds` from 0, plus the final tick. */
export interface MatchTimeline {
  intervalSeconds: number;
  seconds: number[];
  players: PlayerTimeline[];
}

export interface EndMessage {
  t: "end";
  /** -1 for a draw. */
  winningTeam: number;
  durationSeconds: number;
  players: EndPlayer[];
  timeline: MatchTimeline;
}

export interface ErrorMessage {
  t: "error";
  message: string;
}

export interface PongMessage {
  t: "pong";
  c: number;
}

export type ServerMessage = LobbyMessage | WelcomeMessage | StateMessage | EventsMessage | EndMessage | ErrorMessage | PongMessage;

export type Command =
  | { type: "move"; units: number[]; x: number; y: number; attackMove?: boolean }
  | { type: "attack"; units: number[]; target: number }
  | { type: "gather"; units: number[]; target: number; tileX?: number; tileY?: number }
  | { type: "build"; units: number[]; building: string; x: number; y: number }
  | { type: "buildLine"; units: number[]; building: string; x1: number; y1: number; x2: number; y2: number }
  | { type: "construct"; units: number[]; target: number }
  | { type: "stop"; units: number[] }
  | { type: "train"; building: number; unit: string }
  | { type: "cancelTrain"; building: number }
  | { type: "rally"; building: number; x: number; y: number }
  | { type: "ability"; slot: number; x: number; y: number }
  | { type: "tribute"; to: number; resource: string; amount: number }
  | { type: "heroStat"; stat: string }
  | { type: "reviveHero"; building: number }
  | { type: "upgrade"; building: number }
  | { type: "cancelUpgrade"; building: number }
  | { type: "trade"; building: number; resource: string; buy: boolean }
  | { type: "buyItem"; item: string }
  | { type: "sellItem"; slot: number };
