import type { PlayerView } from "../net/protocol";

/** Team hue families (blue, red, green, gold) with one shade per seat, so allies read as one side. */
const TEAM_SHADES = [
  ["#3b82f6", "#22d3ee", "#6366f1", "#93c5fd"],
  ["#ef4444", "#f97316", "#ec4899", "#fca5a5"],
  ["#22c55e", "#a3e635", "#14b8a6", "#86efac"],
  ["#eab308", "#f59e0b", "#a855f7", "#fde047"],
];
export const NEUTRAL_COLOR = "#a8a29e";
export const TEAM_NAMES = ["Azure", "Crimson", "Verdant", "Gold"];

export function playerColor(players: PlayerView[], owner: number): string {
  const player = players.find((p) => p.index === owner);
  if (!player) return NEUTRAL_COLOR;
  const slot = players.filter((p) => p.team === player.team && p.index < player.index).length;
  const shades = TEAM_SHADES[player.team % TEAM_SHADES.length]!;
  return shades[slot % shades.length]!;
}

export function teamColor(team: number): string {
  return TEAM_SHADES[team % TEAM_SHADES.length]![0]!;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}
