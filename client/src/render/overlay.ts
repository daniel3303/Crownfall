import type { ClientWorld, WorldEntity } from "../game/world";
import { Flags } from "../net/protocol";
import type { RtsCamera } from "./camera";

interface FloatingText {
  x: number;
  y: number;
  h: number;
  text: string;
  color: string;
  start: number;
  duration: number;
  size: number;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface GroundCircle {
  x: number;
  y: number;
  radius: number;
  color: string;
}

const BAR_MINE = "#4ade80";
const BAR_ALLY = "#38bdf8";
const BAR_ENEMY = "#f87171";
const BAR_NEUTRAL = "#facc15";

/** 2D canvas over the 3D view: health bars, hero levels and names, floating numbers, the drag box and range circles. */
export class Overlay {
  private readonly context: CanvasRenderingContext2D;
  private texts: FloatingText[] = [];
  dragRect: ScreenRect | null = null;
  circles: GroundCircle[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: RtsCamera,
    private readonly heightOf: (entity: WorldEntity) => number,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas unavailable");
    this.context = context;
  }

  float(x: number, y: number, h: number, text: string, color: string, now: number, size = 13): void {
    if (this.texts.length > 80) this.texts.shift();
    this.texts.push({ x, y, h, text, color, start: now, duration: 1300, size });
  }

  draw(world: ClientWorld, selected: ReadonlySet<number>, now: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }
    const ctx = this.context;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const zoom = this.camera.scale;
    for (const circle of this.circles) this.drawCircle(circle);
    for (const entity of world.entities.values()) {
      if (!entity.ghost) this.drawBar(world, entity, selected.has(entity.id), zoom);
    }
    this.drawTexts(now);
    if (this.dragRect) this.drawDragRect(this.dragRect);
  }

  private drawBar(world: ClientWorld, entity: WorldEntity, isSelected: boolean, zoom: number): void {
    const isHero = (entity.flags & Flags.Hero) !== 0;
    const building = entity.info.category === "building";
    const node = entity.info.category === "node";
    const constructing = building && world.isUnderConstruction(entity);
    const damaged = entity.hp < entity.maxHp;
    if (!isSelected && !isHero && !constructing && (!damaged || node)) return;
    const point = this.camera.toScreen(entity.renderX, entity.renderY, this.heightOf(entity) + 0.25);
    if (!point) return;
    const base = isHero ? 58 : building ? 70 : node ? 40 : 30;
    const w = base * Math.min(1.4, Math.max(0.6, zoom));
    const h = isHero ? 7 : 5;
    const x = point.x - w / 2;
    const y = point.y - h;
    const ctx = this.context;
    ctx.fillStyle = "rgba(10,10,14,0.8)";
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = this.barColor(world, entity);
    ctx.fillRect(x, y, w * Math.max(0, entity.hp / Math.max(1, entity.maxHp)), h);
    if (isHero) {
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      for (let tick = 1; tick < entity.maxHp / 100; tick++) ctx.fillRect(x + (w * tick * 100) / entity.maxHp, y, 1, h);
      this.drawLevel(x - 9, y + h / 2, entity.extra);
      const owner = world.players.find((p) => p.index === entity.owner);
      if (owner) this.drawName(point.x, y - 4, owner.name);
    } else if (entity.info.category === "unit" && entity.level > 1) {
      this.drawRank(x - 3, y + h / 2, entity.level - 1);
    }
    if (constructing) {
      ctx.fillStyle = "rgba(10,10,14,0.8)";
      ctx.fillRect(x - 1, y + h + 2, w + 2, 5);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x, y + h + 3, (w * entity.extra) / 100, 3);
    }
  }

  /** The owner's name over a hero, outlined so it reads on grass, water and snow alike. */
  private drawName(cx: number, bottom: number, name: string): void {
    const ctx = this.context;
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(10,10,14,0.85)";
    ctx.strokeText(name, cx, bottom);
    ctx.fillStyle = "#f5f5f4";
    ctx.fillText(name, cx, bottom);
  }

  /** Gold chevrons left of a trained unit's bar, one per rank above the first. */
  private drawRank(right: number, cy: number, chevrons: number): void {
    const ctx = this.context;
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 2;
    for (let i = 0; i < chevrons; i++) {
      const x = right - 4 - i * 8;
      ctx.beginPath();
      ctx.moveTo(x - 3, cy + 2);
      ctx.lineTo(x, cy - 1);
      ctx.lineTo(x + 3, cy + 2);
      ctx.stroke();
    }
  }

  private drawLevel(cx: number, cy: number, level: number): void {
    const ctx = this.context;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#1c1917";
    ctx.fill();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(level), cx, cy + 0.5);
  }

  private barColor(world: ClientWorld, entity: WorldEntity): string {
    if (entity.owner === 255) return BAR_NEUTRAL;
    if (world.isMine(entity.owner)) return BAR_MINE;
    return world.isAlly(entity.owner) ? BAR_ALLY : BAR_ENEMY;
  }

  private drawTexts(now: number): void {
    this.texts = this.texts.filter((t) => now - t.start < t.duration);
    const ctx = this.context;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const text of this.texts) {
      const point = this.camera.toScreen(text.x, text.y, text.h);
      if (!point) continue;
      const t = (now - text.start) / text.duration;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `bold ${text.size}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.strokeText(text.text, point.x, point.y - t * 34);
      ctx.fillStyle = text.color;
      ctx.fillText(text.text, point.x, point.y - t * 34);
    }
    ctx.globalAlpha = 1;
  }

  private drawCircle(circle: GroundCircle): void {
    const ctx = this.context;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const angle = (i / 40) * Math.PI * 2;
      const point = this.camera.toScreen(circle.x + Math.cos(angle) * circle.radius, circle.y + Math.sin(angle) * circle.radius, 0.05);
      if (!point) return;
      if (i === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = circle.color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawDragRect(rect: ScreenRect): void {
    const ctx = this.context;
    const x = Math.min(rect.x0, rect.x1);
    const y = Math.min(rect.y0, rect.y1);
    const w = Math.abs(rect.x1 - rect.x0);
    const h = Math.abs(rect.y1 - rect.y0);
    ctx.fillStyle = "rgba(74,222,128,0.12)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(74,222,128,0.9)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }
}
