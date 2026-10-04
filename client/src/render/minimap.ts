import type { ClientWorld } from "../game/world";
import { Tile } from "../net/protocol";
import { hexToRgb, NEUTRAL_COLOR, playerColor } from "../ui/palette";

const TILE_RGB: Record<number, [number, number, number]> = {
  [Tile.Grass]: [78, 128, 58],
  [Tile.Sand]: [196, 176, 120],
  [Tile.Water]: [40, 92, 140],
  [Tile.Shallow]: [64, 124, 160],
  [Tile.Tree]: [34, 78, 36],
};

export interface Ping {
  x: number;
  y: number;
  until: number;
  color: string;
}

/** Map overview: terrain under fog, known entities as dots, the camera outline and alert pings. */
export class Minimap {
  private readonly context: CanvasRenderingContext2D;
  private readonly terrain: ImageData;
  private readonly scratch: HTMLCanvasElement;
  private readonly scratchContext: CanvasRenderingContext2D;
  private tilesVersion = -1;
  private fogVersion = -1;
  pings: Ping[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: ClientWorld,
  ) {
    this.context = canvas.getContext("2d")!;
    this.scratch = document.createElement("canvas");
    this.scratch.width = world.width;
    this.scratch.height = world.height;
    this.scratchContext = this.scratch.getContext("2d")!;
    this.terrain = this.scratchContext.createImageData(world.width, world.height);
  }

  /** Map coordinates for a CSS pixel inside the minimap. */
  toMap(px: number, py: number): { x: number; y: number } {
    return { x: (px / this.canvas.clientWidth) * this.world.width, y: (py / this.canvas.clientHeight) * this.world.height };
  }

  draw(corners: ({ x: number; y: number } | null)[], now: number): void {
    const size = this.canvas.clientWidth;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(size * dpr)) {
      this.canvas.width = Math.round(size * dpr);
      this.canvas.height = Math.round(this.canvas.clientHeight * dpr);
    }
    const ctx = this.context;
    const sx = this.canvas.clientWidth / this.world.width;
    const sy = this.canvas.clientHeight / this.world.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.refreshTerrain();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.scratch, 0, 0, this.canvas.clientWidth, this.canvas.clientHeight);
    for (const entity of this.world.entities.values()) {
      const color = entity.owner === 255 ? (entity.info.category === "node" ? "#fde68a" : NEUTRAL_COLOR) : playerColor(this.world.players, entity.owner);
      ctx.fillStyle = color;
      if (entity.info.category === "unit") {
        ctx.fillRect(entity.renderX * sx - 1.5, entity.renderY * sy - 1.5, 3, 3);
      } else {
        const f = this.world.footprint(entity);
        ctx.globalAlpha = entity.ghost ? 0.55 : 1;
        ctx.fillRect(f.x * sx, f.y * sy, Math.max(3, f.size * sx), Math.max(3, f.size * sy));
        ctx.globalAlpha = 1;
      }
    }
    this.drawView(corners, sx, sy);
    this.pings = this.pings.filter((p) => p.until > now);
    for (const ping of this.pings) {
      const phase = (now / 400) % 1;
      ctx.strokeStyle = ping.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ping.x * sx, ping.y * sy, 4 + phase * 10, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawView(corners: ({ x: number; y: number } | null)[], sx: number, sy: number): void {
    if (corners.some((c) => c === null)) return;
    const ctx = this.context;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    corners.forEach((corner, i) => {
      const c = corner!;
      if (i === 0) ctx.moveTo(c.x * sx, c.y * sy);
      else ctx.lineTo(c.x * sx, c.y * sy);
    });
    ctx.closePath();
    ctx.stroke();
  }

  private refreshTerrain(): void {
    if (this.tilesVersion === this.world.tilesVersion && this.fogVersion === this.world.fog.version) return;
    this.tilesVersion = this.world.tilesVersion;
    this.fogVersion = this.world.fog.version;
    const data = this.terrain.data;
    const { visible, explored } = this.world.fog;
    for (let i = 0; i < this.world.tiles.length; i++) {
      const [r, g, b] = TILE_RGB[this.world.tiles[i]!] ?? TILE_RGB[Tile.Grass]!;
      const light = visible[i] ? 1 : explored[i] ? 0.62 : 0.24;
      data[i * 4] = r * light;
      data[i * 4 + 1] = g * light;
      data[i * 4 + 2] = b * light;
      data[i * 4 + 3] = 255;
    }
    this.scratchContext.putImageData(this.terrain, 0, 0);
  }
}

export function pingColor(tone: string): string {
  return tone === "alert" ? "#f87171" : tone === "success" ? "#4ade80" : hexToRgbString(NEUTRAL_COLOR);
}

function hexToRgbString(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r * 255},${g * 255},${b * 255})`;
}
