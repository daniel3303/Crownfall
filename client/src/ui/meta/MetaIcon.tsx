import {
  Bird,
  CalendarCheck,
  CircleHelp,
  Coins,
  Crown,
  Flame,
  Gem,
  GraduationCap,
  Hammer,
  Medal,
  Moon,
  Shield,
  ShieldCheck,
  Skull,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

const GLYPHS: Record<string, LucideIcon> = {
  bird: Bird,
  calendar: CalendarCheck,
  coins: Coins,
  crown: Crown,
  flame: Flame,
  gem: Gem,
  graduation: GraduationCap,
  hammer: Hammer,
  medal: Medal,
  moon: Moon,
  shield: Shield,
  shieldCheck: ShieldCheck,
  skull: Skull,
  sparkles: Sparkles,
  swords: Swords,
  target: Target,
  timer: Timer,
  trophy: Trophy,
  users: Users,
};

/** Line glyphs for crests, achievements and toasts; sized by font size like the HUD icons. */
export function MetaIcon({ id }: { id: string }) {
  const Glyph = GLYPHS[id] ?? CircleHelp;
  return <Glyph className="meta-icon" size="1.15em" strokeWidth={2} aria-hidden />;
}
