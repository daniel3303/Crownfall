import { audio } from "./audio";
import { ClientWorld } from "./game/world";
import { InputController } from "./input/input-controller";
import { publishMatchEvents } from "./meta/match-events";
import { TUTORIAL_CONFIG } from "./meta/tutorial";
import { api } from "./net/api";
import { Connection } from "./net/connection";
import type { MatchConfig, ServerMessage, SnapshotFrame } from "./net/protocol";
import { GameView } from "./play/game-view";
import { metaStore } from "./ui/meta/meta-store";
import { store } from "./ui/store";

export interface Profile {
  name: string;
  race: string;
}

/** One connection to one match, from lobby to end screen. The React UI drives it through `session`. */
class MatchSession {
  private connection: Connection | null = null;
  private world: ClientWorld | null = null;
  private view: GameView | null = null;
  private input: InputController | null = null;
  /** The tutorial skips the lobby: its host starts the match on the first lobby message. */
  private autoStart = false;

  get game(): GameView | null {
    return this.view;
  }

  get link(): Connection | null {
    return this.connection;
  }

  async quickPlay(profile: Profile): Promise<void> {
    await this.run(() => api.quickPlay(), profile);
  }

  async create(config: Partial<MatchConfig>, profile: Profile): Promise<void> {
    await this.run(() => api.create(config), profile);
  }

  async join(matchId: string, profile: Profile): Promise<void> {
    await this.run(() => api.get(matchId), profile);
  }

  /** A private one-on-one against a bot that never attacks, guided by the tutorial overlay. */
  async tutorial(profile: Profile): Promise<void> {
    await this.run(() => api.create(TUTORIAL_CONFIG), profile, true);
  }

  /** Mounts the 3D view once React has rendered the game canvases. */
  attach(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement, minimap: HTMLCanvasElement): void {
    if (!this.world || !this.connection || this.view) return;
    this.view = new GameView(canvas, overlay, minimap, this.world, this.connection);
    this.input = new InputController(canvas, this.view);
    this.view.onSnapshot();
  }

  leave(): void {
    this.teardown();
    store.reset();
  }

  private async run(open: () => Promise<{ id: string }>, profile: Profile, autoStart = false): Promise<void> {
    this.teardown();
    this.autoStart = autoStart;
    store.reset({ screen: "connecting" });
    try {
      const match = await open();
      this.connection = new Connection(match.id, profile.name, profile.race, {
        message: (message) => this.message(message),
        snapshot: (frame) => this.snapshot(frame),
        closed: (reason) => this.closed(reason),
      });
    } catch (error) {
      store.reset({ error: error instanceof Error ? error.message : "Could not reach the server." });
    }
  }

  private message(message: ServerMessage): void {
    switch (message.t) {
      case "lobby":
        if (this.autoStart) {
          // The lobby stays behind the splash, so a refused start can fall back to it.
          this.autoStart = false;
          store.set({ lobby: message });
          this.connection?.startMatch();
          break;
        }
        store.set({ screen: "lobby", lobby: message });
        break;
      case "welcome":
        this.detachView();
        this.world = new ClientWorld(message);
        store.set({
          screen: "game",
          lobby: null,
          match: { id: message.matchId, you: message.you, config: message.config, players: message.players },
        });
        audio.startSoundscape();
        break;
      case "state":
        if (this.world) this.world.players = message.players;
        store.set({ stats: message });
        break;
      case "events":
        this.world?.applyEvents(message.events);
        this.view?.onEvents(message.events);
        publishMatchEvents(message.events);
        break;
      case "end": {
        metaStore.recordEnd(message, store.get().match);
        store.set({ end: message });
        const myTeam = this.world?.myTeam ?? -1;
        audio.stopSoundscape();
        audio.play(message.winningTeam === myTeam ? "victory" : "defeat");
        break;
      }
      case "error": {
        const stuck = store.get().screen === "connecting" && store.get().lobby;
        store.set(stuck ? { error: message.message, screen: "lobby" } : { error: message.message });
        break;
      }
      case "pong":
        break;
    }
  }

  private snapshot(frame: SnapshotFrame): void {
    if (!this.world) return;
    this.world.applySnapshot(frame, performance.now());
    this.view?.onSnapshot();
  }

  private closed(reason: string): void {
    const ended = store.get().end !== null;
    this.teardown();
    if (!ended) store.reset({ error: reason });
  }

  private detachView(): void {
    this.input?.dispose();
    this.view?.dispose();
    this.input = null;
    this.view = null;
  }

  private teardown(): void {
    audio.stopSoundscape();
    this.detachView();
    this.connection?.close();
    this.connection = null;
    this.world = null;
  }
}

export const session = new MatchSession();
