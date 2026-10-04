import type { Command } from "../net/protocol";
import type { ClientWorld } from "../game/world";

const ACTION_HINTS: Record<string, string> = {
  gather: "Right-click to gather",
  attack: "Right-click to attack",
  construct: "Right-click to help build",
};

/** The hover label for a right-click; gathering from an enemy building is a raid. */
export function actionHint(world: ClientWorld, command: Command | null): string | undefined {
  if (!command) return undefined;
  if (isSteal(world, command)) return "Right-click to steal resources";
  return ACTION_HINTS[command.type];
}

function isSteal(world: ClientWorld, command: Command): boolean {
  if (command.type !== "gather" || command.target === 0) return false;
  const target = world.entities.get(command.target);
  return target?.info.category === "building" && !world.isAlly(target.owner);
}

export type CursorKind = "pointer" | "move" | "attack" | "gather-wood" | "gather-mine" | "gather-food" | "build" | "rally" | "target";

/** The tip of each pointer image, where the click lands. */
const HOTSPOTS: Record<Exclude<CursorKind, "target">, [number, number]> = {
  pointer: [3, 3],
  move: [3, 3],
  attack: [3, 3],
  "gather-wood": [4, 4],
  "gather-mine": [4, 4],
  "gather-food": [4, 4],
  build: [4, 4],
  rally: [6, 29],
};

export function cursorCss(kind: CursorKind): string {
  if (kind === "target") return "crosshair";
  const [x, y] = HOTSPOTS[kind];
  return `url("/cursors/${kind}.svg") ${x} ${y}, ${kind === "pointer" ? "default" : "pointer"}`;
}

/** The cursor that announces what a right-click would do. */
export function cursorFor(world: ClientWorld, command: Command | null): CursorKind {
  if (!command) return "pointer";
  switch (command.type) {
    case "attack":
      return "attack";
    case "construct":
      return "build";
    case "rally":
      return "rally";
    case "move":
      return command.attackMove ? "attack" : "move";
    case "gather": {
      if (command.target === 0) return "gather-wood";
      const resource = world.entities.get(command.target)?.info;
      if (resource?.category === "node") return resource.def.resource === "food" ? "gather-food" : "gather-mine";
      if (isSteal(world, command)) return "gather-mine";
      return "gather-food";
    }
    default:
      return "pointer";
  }
}
