import { useEffect, useState } from "react";
import {
  Axe,
  Bone,
  Bot,
  BowArrow,
  Castle,
  Cherry,
  CircleHelp,
  Coins,
  Crosshair,
  Crown,
  Drumstick,
  Flame,
  Hand,
  House,
  Lock,
  Maximize,
  Megaphone,
  Mountain,
  Pickaxe,
  Shield,
  Skull,
  Sword,
  Swords,
  Tornado,
  TowerControl,
  TreePine,
  Users,
  Volume2,
  VolumeX,
  Warehouse,
  Wheat,
  type LucideIcon,
  ArrowBigRightDash,
  ArrowLeftRight,
  BrickWall,
  CircleArrowUp,
  CircleX,
  DoorOpen,
  Droplet,
  Eye,
  Footprints,
  HandCoins,
  HeartPlus,
  HeartPulse,
  BrickWallShield,
  Package,
  RotateCcw,
  ShieldHalf,
  ShoppingCart,
  Sparkles,
  Zap,
} from "lucide-react";
import { content } from "../content/content";
import { onPortraits, portraitUrl } from "../render/portrait-store";

const ICONS: Record<string, LucideIcon> = {
  villager: Pickaxe,
  spearman: Sword,
  archer: BowArrow,
  rider: Axe,
  paladin: Shield,
  warchief: Crown,
  wolf: Bone,
  troll: Skull,
  townCenter: Castle,
  house: House,
  storehouse: Warehouse,
  farm: Wheat,
  barracks: Swords,
  tower: TowerControl,
  berries: Cherry,
  goldMine: Coins,
  stoneMine: Mountain,
  food: Drumstick,
  wood: TreePine,
  stone: Mountain,
  gold: Coins,
  cleave: Tornado,
  rally: Megaphone,
  doomfall: Flame,
  population: Users,
  fullscreen: Maximize,
  soundOn: Volume2,
  soundOff: VolumeX,
  bot: Bot,
  host: Crown,
  battle: Swords,
  stop: Hand,
  attackMove: Crosshair,
  locked: Lock,
  charge: ArrowBigRightDash,
  attackDamage: Sword,
  attackSpeed: Zap,
  moveSpeed: Footprints,
  maxHealth: HeartPlus,
  lifeSteal: Droplet,
  regen: HeartPulse,
  armor: ShieldHalf,
  sight: Eye,
  revive: RotateCcw,
  points: Sparkles,
  upgrade: CircleArrowUp,
  cancelUpgrade: CircleX,
  buy: ShoppingCart,
  sell: HandCoins,
  trade: ArrowLeftRight,
  storage: Package,
  wall: BrickWall,
  gate: DoorOpen,
  wallTower: BrickWallShield,
  stoneWall: BrickWall,
};

/** A line icon for a unit, building, resource or ability id, coloured by its `icon-<id>` class; sized by font size. */
export function Icon({ id }: { id: string }) {
  const Glyph = ICONS[id] ?? CircleHelp;
  return <Glyph className={`icon icon-${id}`} size="1.15em" strokeWidth={2} aria-hidden />;
}

/** Each unit's portrait file, its borrowed model's while it has none of its own. */
const UNIT_PORTRAITS = new Map(content.units.map((unit) => [unit.id, unit.model ?? unit.id]));

/**
 * A unit's painted head-and-shoulders portrait or a building's rendered still, for the larger HUD slots; anything
 * without one, or a building before its still is drawn, shows the line icon.
 */
export function Portrait({ id }: { id: string }) {
  const still = useBuildingStill(id);
  const portrait = UNIT_PORTRAITS.get(id);
  const src = portrait ? `/assets/portraits/${portrait}.webp` : still;
  if (!src) return <Icon id={id} />;
  return <img className="portrait" src={src} alt="" draggable={false} />;
}

function useBuildingStill(id: string): string | undefined {
  const [url, setUrl] = useState(() => portraitUrl(id));
  useEffect(() => {
    setUrl(portraitUrl(id));
    return onPortraits(() => setUrl(portraitUrl(id)));
  }, [id]);
  return url;
}
