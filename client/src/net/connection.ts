import { decodeSnapshot, type Command, type ServerMessage, type SnapshotFrame } from "./protocol";

export interface ConnectionHandlers {
  message(message: ServerMessage): void;
  snapshot(frame: SnapshotFrame): void;
  closed(reason: string): void;
}

const PING_INTERVAL_MS = 2000;

/** The match WebSocket: JSON text frames both ways, binary snapshots from the server. */
export class Connection {
  private readonly socket: WebSocket;
  private pingTimer = 0;
  private closedByUs = false;
  latencyMs = 0;

  constructor(matchId: string, name: string, race: string, hero: string, private readonly handlers: ConnectionHandlers) {
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const query = new URLSearchParams({ match: matchId, name, race, hero });
    this.socket = new WebSocket(`${scheme}://${location.host}/ws?${query}`);
    this.socket.binaryType = "arraybuffer";
    this.socket.onopen = () => {
      this.pingTimer = window.setInterval(() => this.send({ t: "ping", c: performance.now() }), PING_INTERVAL_MS);
    };
    this.socket.onmessage = (event) => this.receive(event);
    this.socket.onclose = () => {
      window.clearInterval(this.pingTimer);
      if (!this.closedByUs) this.handlers.closed("Disconnected from the server.");
    };
  }

  command(command: Command): void {
    this.send({ t: "cmd", c: command });
  }

  startMatch(): void {
    this.send({ t: "lobby", action: "start" });
  }

  switchTeam(team: number): void {
    this.send({ t: "lobby", action: "team", team });
  }

  setRace(race: string): void {
    this.send({ t: "lobby", action: "race", race });
  }

  setHero(hero: string): void {
    this.send({ t: "lobby", action: "hero", hero });
  }

  setName(name: string): void {
    this.send({ t: "lobby", action: "name", name });
  }

  close(): void {
    this.closedByUs = true;
    window.clearInterval(this.pingTimer);
    this.socket.close();
  }

  private send(payload: unknown): void {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(payload));
  }

  private receive(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.handlers.snapshot(decodeSnapshot(event.data));
      return;
    }
    const message = JSON.parse(event.data as string) as ServerMessage;
    if (message.t === "pong") {
      this.latencyMs = Math.round(performance.now() - message.c);
      return;
    }
    this.handlers.message(message);
  }
}
