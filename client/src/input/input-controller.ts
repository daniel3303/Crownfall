import { content } from "../content/content";
import type { GameView } from "../play/game-view";
import { slotForKey } from "../ui/hud/hero-kit";
import { store } from "../ui/store";
import { decay, grabDelta, smoothVelocity, trackVelocity, wheelIntent, type MapPoint } from "./drag-pan";

/** A left press moving less than this is still a click; past it, it drags the map. */
const PAN_THRESHOLD_PX = 8;
/** A right press moving less than this is still an order; past it, it drags a selection box. */
const BOX_THRESHOLD_PX = 14;
const DOUBLE_CLICK_MS = 320;
/** Map units per second per unit of camera distance, so a pan crosses the screen in about the same time at any zoom. */
const PAN_SPEED = 1.9;
const STOPPED = 0.001;
/** A fling slower than this, in map units per second, has stopped. */
const FLING_STOPPED = 0.05;
/** A drag that paused this long before release does not fling. */
const FLING_HOLD_MS = 80;
const TRAIN_KEYS = ["z", "x", "c", "v"];
const UPGRADE_KEY = "u";
const SHOP_KEY = "p";
const MAC = /Mac/.test(navigator.platform);

/** Firefox on a Mac reports a Ctrl-click as the right button; Chrome and Safari report the left one. */
function buttonOf(e: PointerEvent): number {
  return MAC && e.ctrlKey && e.button === 2 ? 0 : e.button;
}

/**
 * A press on the map: the left button selects on a click and drags the map; the right button orders on a click and
 * drags a selection box; the middle button only drags the map.
 */
interface Press {
  button: number;
  /** What releasing the press without moving it does. */
  click: "select" | "order" | "none";
  /** What moving the press does. */
  drag: "pan" | "box";
  start: MapPoint;
  last: MapPoint;
  lastAt: number;
  moved: boolean;
}

/**
 * Mouse and keyboard for the battlefield: click to select, right-click orders, right-drag box selection, the camera
 * panned by a left- or middle-drag, a trackpad swipe, arrow keys or the minimap, LoL-style hero keys.
 */
export class InputController {
  private press: Press | null = null;
  /** True while a left drag lays out a wall line in placement mode. */
  private drawingLine = false;
  private lastClick = { at: 0, x: 0, y: 0 };
  private lastGroupKey = { index: -1, at: 0 };
  private readonly keysDown = new Set<string>();
  private readonly velocity = { x: 0, y: 0 };
  private fling: MapPoint = { x: 0, y: 0 };
  private frame = 0;
  private lastTick = performance.now();
  private readonly cleanup: (() => void)[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly view: GameView,
  ) {
    this.listen(canvas, "pointerdown", (e) => this.pointerDown(e as PointerEvent));
    this.listen(window, "pointermove", (e) => this.pointerMove(e as PointerEvent));
    this.listen(window, "pointerup", (e) => this.pointerUp(e as PointerEvent));
    this.listen(canvas, "wheel", (e) => this.wheel(e as WheelEvent), { passive: false });
    // On a Mac, Ctrl-click also raises a context menu; the game owns both buttons.
    this.listen(canvas, "contextmenu", (e) => e.preventDefault());
    this.listen(canvas, "pointerleave", () => view.pointerLeft());
    this.listen(window, "keydown", (e) => this.keyDown(e as KeyboardEvent));
    this.listen(window, "keyup", (e) => this.keyUp(e as KeyboardEvent));
    this.listen(window, "blur", () => this.keysDown.clear());
    this.frame = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    for (const remove of this.cleanup) remove();
  }

  private listen(target: EventTarget, type: string, handler: (event: Event) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.cleanup.push(() => target.removeEventListener(type, handler, options));
  }

  private local(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private pointerDown(e: PointerEvent): void {
    const p = this.local(e);
    const mode = this.view.mode;
    const button = buttonOf(e);
    if (button === 2) {
      e.preventDefault();
      this.lastClick.at = 0;
      // A right-click first cancels a placement or targeting mode; only a plain one gives an order.
      const click = mode.kind === "normal" ? "order" : "none";
      if (mode.kind !== "normal") this.view.setMode({ kind: "normal" });
      this.startPress(button, click, "box", p);
      return;
    }
    if (button === 1) {
      e.preventDefault();
      this.startPress(button, "none", "pan", p);
      return;
    }
    if (button !== 0) return;
    if (mode.kind === "place") {
      // A wall is laid along a drag from here to the release instead of placed on the press.
      if (this.view.beginLine(p.x, p.y)) this.drawingLine = true;
      else if (this.view.place(p.x, p.y) && !e.shiftKey) this.view.setMode({ kind: "normal" });
      return;
    }
    if (mode.kind === "ability") {
      this.view.castAt(p.x, p.y);
      return;
    }
    if (mode.kind === "attackMove") {
      this.view.order(p.x, p.y, true);
      if (!e.shiftKey) this.view.setMode({ kind: "normal" });
      return;
    }
    this.startPress(button, "select", "pan", p);
  }

  private startPress(button: number, click: Press["click"], drag: Press["drag"], p: MapPoint): void {
    this.fling = { x: 0, y: 0 };
    this.press = { button, click, drag, start: p, last: p, lastAt: performance.now(), moved: false };
  }

  private pointerMove(e: PointerEvent): void {
    const p = this.local(e);
    // Over the HUD the world is hidden, so nothing there is hovered or previewed.
    if (e.target === this.canvas || this.press) this.view.pointerMoved(p.x, p.y);
    else this.view.pointerLeft();
    const press = this.press;
    if (!press) return;
    const threshold = press.drag === "pan" ? PAN_THRESHOLD_PX : BOX_THRESHOLD_PX;
    if (!press.moved && Math.hypot(p.x - press.start.x, p.y - press.start.y) <= threshold) return;
    if (!press.moved) {
      press.moved = true;
      if (press.drag === "pan") this.canvas.style.cursor = "grabbing";
    }
    if (press.drag === "pan") this.dragMap(press, p);
    else this.view.renderer.overlay.dragRect = { x0: press.start.x, y0: press.start.y, x1: p.x, y1: p.y };
  }

  /** Moves the camera so the ground grabbed at the press stays under the pointer, and measures the speed for a fling. */
  private dragMap(press: Press, p: MapPoint): void {
    const camera = this.view.renderer.camera;
    const step = grabDelta(press.last, p, (x, y) => camera.groundAt(x, y));
    const now = performance.now();
    if (step) {
      camera.pan(step.x, step.y);
      this.fling = trackVelocity(this.fling, step, (now - press.lastAt) / 1000);
    }
    press.last = p;
    press.lastAt = now;
  }

  private pointerUp(e: PointerEvent): void {
    if (this.drawingLine && buttonOf(e) === 0) {
      this.drawingLine = false;
      const end = this.local(e);
      if (this.view.endLine(end.x, end.y) && !e.shiftKey) this.view.setMode({ kind: "normal" });
      return;
    }
    const press = this.press;
    if (!press || buttonOf(e) !== press.button) return;
    const p = this.local(e);
    this.press = null;
    this.view.renderer.overlay.dragRect = null;
    this.canvas.style.cursor = "";
    if (press.moved) {
      if (press.drag === "box") this.view.boxSelect(press.start.x, press.start.y, p.x, p.y, e.shiftKey);
      else if (performance.now() - press.lastAt > FLING_HOLD_MS) this.fling = { x: 0, y: 0 };
      return;
    }
    if (press.click === "order") this.view.order(press.start.x, press.start.y, false);
    if (press.click !== "select") return;
    const at = press.start;
    const now = performance.now();
    const double = now - this.lastClick.at < DOUBLE_CLICK_MS && Math.hypot(at.x - this.lastClick.x, at.y - this.lastClick.y) < 10;
    this.lastClick = { at: now, x: at.x, y: at.y };
    this.view.clickSelect(at.x, at.y, e.shiftKey, double);
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    const intent = wheelIntent(e as WheelEvent & { wheelDeltaY?: number });
    const camera = this.view.renderer.camera;
    if (intent.kind === "zoom") {
      camera.zoomBy(intent.factor);
      return;
    }
    // A swipe scrolls the map like a page: the ground a swipe-length below the centre comes up to it.
    const centre = { x: this.canvas.clientWidth / 2, y: this.canvas.clientHeight / 2 };
    const step = grabDelta({ x: centre.x + intent.dx, y: centre.y + intent.dy }, centre, (x, y) => camera.groundAt(x, y));
    if (step) camera.pan(step.x, step.y);
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const key = e.key.toLowerCase();
    this.keysDown.add(key);
    if (/^[0-9]$/.test(key)) {
      e.preventDefault();
      this.group(Number(key), e.ctrlKey || e.metaKey);
      return;
    }
    if (key === "tab") {
      e.preventDefault();
      store.set({ scoreboard: true });
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (this.hotkey(key)) e.preventDefault();
  }

  private keyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keysDown.delete(key);
    if (key === "tab") store.set({ scoreboard: false });
  }

  private hotkey(key: string): boolean {
    const view = this.view;
    const selection = view.currentSelection();
    if (key === "escape") {
      if (store.get().shop) store.set({ shop: false });
      else if (view.mode.kind !== "normal") view.setMode({ kind: "normal" });
      else view.selection.clear();
      return true;
    }
    if (key === SHOP_KEY) {
      store.set({ shop: !store.get().shop });
      return true;
    }
    if (key === " ") {
      view.selectHero(true);
      return true;
    }
    if (key === ".") {
      view.nextIdleVillager();
      return true;
    }
    const ability = slotForKey(view.world.heroOf(view.world.you), key);
    if (ability >= 0) {
      view.castAbility(ability, true);
      return true;
    }
    if (selection.kind === "units" && selection.villagers) {
      const building = content.buildings.find((b) => b.hotkey?.toLowerCase() === key);
      if (building) {
        view.beginPlacement(building.id);
        return true;
      }
    }
    if (selection.kind === "units") {
      if (key === "a") {
        view.setMode({ kind: "attackMove" });
        return true;
      }
      if (key === "x") {
        view.stop();
        return true;
      }
    }
    if (selection.kind === "building" && !selection.constructing) {
      const slot = TRAIN_KEYS.indexOf(key);
      const unit = selection.trains[slot];
      if (unit) {
        view.train(unit);
        return true;
      }
      if (key === "backspace" || key === "delete") {
        view.cancelTrain();
        return true;
      }
      if (key === UPGRADE_KEY) {
        view.upgrade();
        return true;
      }
    }
    return false;
  }

  private group(index: number, save: boolean): void {
    if (save) {
      this.view.saveGroup(index);
      store.notify(`Group ${index} set.`, "info");
      return;
    }
    const now = performance.now();
    const double = this.lastGroupKey.index === index && now - this.lastGroupKey.at < DOUBLE_CLICK_MS;
    this.lastGroupKey = { index, at: now };
    this.view.recallGroup(index, double);
  }

  /**
   * Arrow keys, eased toward the input, and the glide of a flung map, both frame-rate independent; holding Space keeps
   * the camera on the hero.
   */
  private readonly tick = (now: number): void => {
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    let dx = 0;
    let dy = 0;
    if (this.keysDown.has("arrowleft")) dx -= 1;
    if (this.keysDown.has("arrowright")) dx += 1;
    if (this.keysDown.has("arrowup")) dy -= 1;
    if (this.keysDown.has("arrowdown")) dy += 1;
    if (!this.press && Math.hypot(this.fling.x, this.fling.y) > FLING_STOPPED) {
      this.view.renderer.camera.pan(this.fling.x * dt, this.fling.y * dt);
      this.fling = decay(this.fling, dt);
    }
    this.velocity.x = smoothVelocity(this.velocity.x, Math.max(-1, Math.min(1, dx)), dt);
    this.velocity.y = smoothVelocity(this.velocity.y, Math.max(-1, Math.min(1, dy)), dt);
    if (Math.abs(this.velocity.x) > STOPPED || Math.abs(this.velocity.y) > STOPPED) {
      const speed = PAN_SPEED * this.view.renderer.camera.zoom * dt;
      this.view.renderer.camera.pan(this.velocity.x * speed, this.velocity.y * speed);
    }
    if (this.keysDown.has(" ")) {
      this.fling = { x: 0, y: 0 };
      this.view.followHero();
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
