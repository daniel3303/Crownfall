import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { audio } from "../../audio";
import { VolumeSliders } from "../../audio/VolumeSliders";
import { content, RESOURCE_NAMES, unitDef } from "../../content/content";
import { session } from "../../session";
import { Icon } from "../icons";
import { playerColor } from "../palette";
import { store, useHud } from "../store";
import { toggleFullscreen } from "../fullscreen";
import { PopulationTip, ResourceTip, TextTip } from "../tooltip/Tips";
import { tipProps } from "../tooltip/use-tip";
import { storageLevel } from "./building-upgrades";

export function TopBar() {
  const stats = useHud((s) => s.stats);
  const latency = useHud((s) => s.latency);
  const muted = useHud((s) => s.muted || audio.muted);
  const idle = useHud((s) => s.idleVillagers);
  const sharing = useHud((s) => s.match?.config.sharing);
  const [tribute, setTribute] = useState(false);
  const [mixer, setMixer] = useState(false);
  const elapsed = stats?.elapsedSeconds ?? 0;
  return (
    <div className="topbar">
      <div className="resources">
        {RESOURCE_NAMES.map((name, i) => {
          const amount = stats?.resources[i] ?? 0;
          const cap = stats?.storage?.[i];
          // Amber near the storage cap, red at it: gathering past the cap is lost.
          const level = cap === undefined ? "ok" : storageLevel(amount, cap);
          return (
            <span key={name} className={`resource storage-${level}`} {...tipProps(() => <ResourceTip resource={name} />)}>
              <Icon id={name} /> {amount}
              {cap !== undefined && <small className="resource-cap"> / {cap}</small>}
            </span>
          );
        })}
        <span className="resource" {...tipProps(() => <PopulationTip />)}>
          <Icon id="population" /> {stats?.population ?? 0}/{stats?.populationCap ?? 0}
        </span>
        {sharing === "shared" && <span className="tag">team pool</span>}
      </div>
      <div className="clock-group">
        <div className="clock" {...tipProps(() => <TextTip title="Match time" text="There is no time limit: the match ends when one team, allies together, is all that remains. Destroy every enemy town center and villager to win." />)}>
          {clock(elapsed)}
        </div>
        <DragonClock />
      </div>
      <div className="topbar-actions">
        {idle > 0 && (
          <button
            className="btn btn-small btn-warn"
            onClick={() => session.game?.nextIdleVillager()}
            {...tipProps(() => <TextTip title="Idle villagers" hotkey="." text="Villagers with nothing to do. Click to jump to the next one and put it to work." />)}
          >
            <Icon id="villager" /> {idle} idle
          </button>
        )}
        {sharing === "separateWithTribute" && (
          <button className="btn btn-small" onClick={() => { setTribute(!tribute); setMixer(false); }} {...tipProps(() => <TextTip title="Tribute" text="Send resources to an ally, minus a 10% tax." />)}>
            Tribute
          </button>
        )}
        <span className="ping" {...tipProps(() => <TextTip title="Latency" text="Round trip to the game server." />)}>
          {latency} ms
        </span>
        <button className="btn btn-small" onClick={toggleFullscreen} {...tipProps(() => <TextTip title="Fullscreen" text="Gives the battlefield the whole screen." />)}>
          <Icon id="fullscreen" />
        </button>
        <button
          className="btn btn-small"
          onClick={() => {
            audio.setMuted(!muted);
            store.set({ muted: !muted });
          }}
          {...tipProps(() => <TextTip title={muted ? "Sound off" : "Sound on"} text="Mute or unmute game sounds." />)}
        >
          <Icon id={muted ? "soundOff" : "soundOn"} />
        </button>
        <button className="btn btn-small" onClick={() => { setMixer(!mixer); setTribute(false); }} {...tipProps(() => <TextTip title="Volume" text="Music, ambience and effects levels." />)}>
          <SlidersHorizontal className="icon" size="1.15em" strokeWidth={2} aria-hidden />
        </button>
        <button className="btn btn-small" onClick={() => session.leave()}>
          Leave
        </button>
      </div>
      {tribute && <TributePanel onClose={() => setTribute(false)} />}
      {mixer && (
        <div className="sound-panel panel">
          <h3>Sound</h3>
          <VolumeSliders />
        </div>
      )}
    </div>
  );
}

function clock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** When the center dragon lands, whether it is up, and your team's attack buff from slaying it. */
function DragonClock() {
  const dragon = useHud((s) => s.stats?.dragon);
  const rules = content.rules.dragon;
  if (!dragon || !rules) return null;
  const buff = Math.round(rules.buffAttack * 100);
  const name = unitDef(rules.unit).name;
  const text = `The ${name} lands at the center of the map after ${clock(rules.spawnSeconds)} and returns ${Math.round(rules.respawnSeconds / 60)} minutes after it falls. It only fights those who attack it. Slaying it pays ${rules.gold} gold to every stockpile on your team and gives your whole army +${buff}% attack for ${rules.buffSeconds} s.`;
  return (
    <>
      <span className={`dragon-clock ${dragon.isUp ? "up" : ""}`} {...tipProps(() => <TextTip title={name} text={text} />)}>
        <Icon id="dragon" /> {dragon.isUp ? "Dragon awake" : clock(dragon.landsInSeconds)}
      </span>
      {dragon.buffSeconds > 0 && (
        <span className="dragon-buff" {...tipProps(() => <TextTip title="Dragon's might" text={`Your team slew the dragon: +${buff}% attack for every unit.`} />)}>
          <Icon id="dragonBuff" /> +{buff}% {clock(dragon.buffSeconds)}
        </span>
      )}
    </>
  );
}

function TributePanel({ onClose }: { onClose(): void }) {
  const match = useHud((s) => s.match);
  const stats = useHud((s) => s.stats);
  if (!match || !stats) return null;
  const me = stats.players.find((p) => p.index === match.you);
  const allies = stats.players.filter((p) => p.team === me?.team && p.index !== match.you && !p.defeated);
  return (
    <div className="tribute panel">
      <h3>Send tribute (10% tax)</h3>
      {allies.length === 0 && <p className="hint">No allies to support.</p>}
      {allies.map((ally) => (
        <div key={ally.index} className="tribute-row">
          <span style={{ color: playerColor(stats.players, ally.index) }}>{ally.name}</span>
          {RESOURCE_NAMES.map((resource) => (
            <button key={resource} className="btn btn-small" onClick={() => session.game?.tribute(ally.index, resource, 100)}>
              <Icon id={resource} /> 100
            </button>
          ))}
        </div>
      ))}
      <button className="btn btn-small" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
