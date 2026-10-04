import { canAfford, content, type ItemDef } from "../../content/content";
import type { HeroState } from "../../net/protocol";

export interface ItemStatLine {
  icon: string;
  text: string;
}

function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Each stat an item gives as a short line, in the order the shop lists them: "+5 attack", "+12% move speed". */
export function itemStatLines(item: ItemDef): ItemStatLine[] {
  const lines: ItemStatLine[] = [];
  if (item.attack) lines.push({ icon: "attackDamage", text: `+${item.attack} attack` });
  if (item.hp) lines.push({ icon: "maxHealth", text: `+${item.hp} health` });
  if (item.armor && (item.armor.melee || item.armor.pierce)) lines.push({ icon: "armor", text: `+${item.armor.melee} / +${item.armor.pierce} armor` });
  if (item.attackSpeed) lines.push({ icon: "attackSpeed", text: `+${percent(item.attackSpeed)} attack speed` });
  if (item.moveSpeed) lines.push({ icon: "moveSpeed", text: `+${percent(item.moveSpeed)} move speed` });
  if (item.lifeSteal) lines.push({ icon: "lifeSteal", text: `${percent(item.lifeSteal)} life steal` });
  if (item.regen) lines.push({ icon: "regen", text: `+${item.regen} health per second` });
  if (item.cooldownReduction) lines.push({ icon: "cooldown", text: `−${percent(item.cooldownReduction)} ability cooldowns` });
  return lines;
}

/** Why the hero cannot buy an item now, in the order the server refuses; null when it can. */
export type ShopBlock = "fallen" | "away" | "owned" | "full" | "poor" | null;

export function shopBlock(item: ItemDef, hero: HeroState, stock: readonly number[]): ShopBlock {
  if (hero.id === 0) return "fallen";
  if (!hero.canShop) return "away";
  if (hero.items.includes(item.id)) return "owned";
  if (!hero.items.includes(null)) return "full";
  if (!canAfford(item.cost, stock as number[])) return "poor";
  return null;
}

export const SHOP_BLOCK_TEXT: Record<Exclude<ShopBlock, null>, string> = {
  fallen: "Your hero must be alive to trade items.",
  away: "Go near your town center to buy items.",
  owned: "Your hero already carries one.",
  full: "Inventory full: sell an item first.",
  poor: "Not enough resources yet.",
};

/** The shop's items from cheapest to dearest, by total price, so starters come first. */
export function shopItems(): ItemDef[] {
  const total = (item: ItemDef) => Object.values(item.cost).reduce((sum, amount) => sum + (amount ?? 0), 0);
  return [...content.items].sort((a, b) => total(a) - total(b));
}
