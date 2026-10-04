import type { EndPlayer } from "../net/protocol";

export interface MvpCategory {
  id: string;
  title: string;
  /** How the leading value reads on the card, as in "41 kills" or "Hero level 8". */
  describe(value: number): string;
  icon: string;
  value(player: EndPlayer): number;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const MVP_CATEGORIES: MvpCategory[] = [
  { id: "warmonger", title: "Warmonger", describe: (n) => count(n, "kill", "kills"), icon: "swords", value: (p) => p.kills },
  { id: "hero-slayer", title: "Hero Slayer", describe: (n) => count(n, "hero slain", "heroes slain"), icon: "skull", value: (p) => p.heroKills ?? 0 },
  { id: "quartermaster", title: "Quartermaster", describe: (n) => `${n.toLocaleString()} gathered`, icon: "coins", value: (p) => p.gathered },
  { id: "drill-master", title: "Drill Master", describe: (n) => count(n, "soldier trained", "soldiers trained"), icon: "users", value: (p) => p.soldiersTrained ?? 0 },
  { id: "architect", title: "Architect", describe: (n) => count(n, "building", "buildings"), icon: "hammer", value: (p) => p.buildingsBuilt ?? 0 },
  { id: "legend", title: "Living Legend", describe: (n) => `Hero level ${n}`, icon: "crown", value: (p) => p.heroLevel },
];

export interface MvpAward {
  category: MvpCategory;
  player: EndPlayer;
  value: number;
}

/** The best player in each category; ties go to the higher score, then the lower seat. Categories nobody scored in are left out. */
export function mvpAwards(players: EndPlayer[]): MvpAward[] {
  const awards: MvpAward[] = [];
  for (const category of MVP_CATEGORIES) {
    const best = [...players].sort((a, b) => category.value(b) - category.value(a) || b.score - a.score || a.index - b.index)[0];
    if (best && category.value(best) > 0) awards.push({ category, player: best, value: category.value(best) });
  }
  return awards;
}
