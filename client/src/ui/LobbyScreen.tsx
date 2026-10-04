import { useEffect, useRef, useState } from "react";
import { content, unitDef } from "../content/content";
import { session } from "../session";
import { enterFullscreen } from "./fullscreen";
import { HeroPicker } from "./HeroPicker";
import { Icon, Portrait } from "./icons";
import { bannerStyle, frameStyle, OwnFlair, useLook } from "./meta/cosmetics";
import { teamColor, TEAM_NAMES } from "./palette";
import { loadProfile, profileHero, rememberHero, saveProfile } from "./profile";
import { useHud } from "./store";

/** Typing pauses this long before the new name goes to the other players. */
const NAME_SEND_DELAY_MS = 400;

const SHARING_LABELS: Record<string, string> = {
  separate: "Separate resources",
  separateWithTribute: "Separate + tribute",
  shared: "Shared team pool",
};

export function LobbyScreen() {
  const lobby = useHud((s) => s.lobby);
  const [copied, setCopied] = useState(false);
  const look = useLook();
  if (!lobby) return null;
  const me = lobby.seats.find((s) => s.index === lobby.you);
  const teams = Array.from({ length: lobby.config.teams }, (_, team) => lobby.seats.filter((s) => s.team === team));
  const link = `${location.origin}/?match=${lobby.matchId}`;

  const copy = () => {
    void navigator.clipboard?.writeText(link).then(() => setCopied(true));
  };

  return (
    <div className="menu lobby">
      <header className="menu-title">
        <h1>War council</h1>
        <p>
          {SHARING_LABELS[lobby.config.sharing]} · {lobby.config.mapSize} map · bots: {lobby.config.difficulty}
        </p>
      </header>
      <div className="invite">
        <input readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="btn btn-small" onClick={copy}>
          {copied ? "Copied" : "Copy invite"}
        </button>
      </div>
      <div className="teams">
        {teams.map((seats, team) => (
          <section key={team} className="panel team" style={{ borderColor: teamColor(team) }}>
            <h2 style={{ color: teamColor(team) }}>{TEAM_NAMES[team]}</h2>
            <ul>
              {seats.map((seat) => (
                <li key={seat.index} className={seat.index === lobby.you ? "me" : ""} style={seat.index === lobby.you ? bannerStyle(look.banner) : undefined}>
                  <span className="seat-portrait" style={seat.index === lobby.you ? frameStyle(look.frame) : undefined}><Portrait id={seat.hero ?? content.races.find((r) => r.id === seat.race)?.hero ?? ""} /></span>
                  <span className="seat-name">
                    {seat.name}
                    {seat.isHost && <> <Icon id="host" /></>}
                    {seat.index === lobby.you && <OwnFlair />}
                    {seat.hero && <small className="seat-hero"> {unitDef(seat.hero).name}</small>}
                  </span>
                  <small>{seat.isBot ? "bot" : "player"}</small>
                </li>
              ))}
            </ul>
            {me && me.team !== team && seats.some((s) => s.isBot) && (
              <button className="btn btn-small" onClick={() => session.link?.switchTeam(team)}>
                Join {TEAM_NAMES[team]}
              </button>
            )}
          </section>
        ))}
      </div>
      <div className="lobby-actions">
        {me && <NameField key={lobby.you} current={me.name} />}
        <label className="field inline">
          Race
          <select value={me?.race} onChange={(e) => pickRace(e.target.value)}>
            {content.races.map((race) => (
              <option key={race.id} value={race.id}>
                {race.name}
              </option>
            ))}
          </select>
        </label>
        {me && (
          <div className="lobby-heroes">
            <HeroPicker race={me.race} selected={me.hero} onPick={(hero) => pickHero(me.race, hero)} />
          </div>
        )}
        {me?.isHost ? (
          <button
            className="btn btn-primary"
            onClick={() => {
              enterFullscreen();
              session.link?.startMatch();
            }}
          >
            Start battle
          </button>
        ) : (
          <span className="hint">Waiting for the host to start…</span>
        )}
        <button className="btn" onClick={() => session.leave()}>
          Leave
        </button>
      </div>
    </div>
  );
}

/** Switches the seat's race and leads the hero last picked for it, which the server checks belongs to the race. */
function pickRace(race: string): void {
  session.link?.setRace(race);
  session.link?.setHero(profileHero({ ...loadProfile(), race }));
}

function pickHero(race: string, hero: string): void {
  session.link?.setHero(hero);
  rememberHero(race, hero);
}

/** Renames the player's seat as they type, and remembers the name for the next match. */
function NameField({ current }: { current: string }) {
  const [draft, setDraft] = useState(current);
  const [editing, setEditing] = useState(false);
  const pending = useRef<string | null>(null);
  // Out of focus the field shows the name the server settled on, cleaned exactly as the seat shows it.
  useEffect(() => {
    if (!editing) setDraft(current);
  }, [current, editing]);
  useEffect(() => {
    const name = draft.trim();
    pending.current = name && name !== current ? name : null;
    if (!pending.current) return;
    const timer = window.setTimeout(() => sendName(pending), NAME_SEND_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft, current]);
  // A name typed just before the lobby closes still counts.
  useEffect(() => () => sendName(pending), []);
  return (
    <label className="field inline">
      Name
      <input
        value={draft}
        maxLength={16}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          sendName(pending);
          setEditing(false);
        }}
      />
    </label>
  );
}

/** Sends and remembers a name still waiting to go out, at most once. */
function sendName(pending: { current: string | null }): void {
  const name = pending.current;
  if (!name) return;
  pending.current = null;
  session.link?.setName(name);
  saveProfile({ ...loadProfile(), name });
}
