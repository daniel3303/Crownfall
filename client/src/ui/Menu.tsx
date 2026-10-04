import { useEffect, useState } from "react";
import { VolumeSliders } from "../audio/VolumeSliders";
import { content } from "../content/content";
import { api } from "../net/api";
import type { MatchConfig, MatchSummary } from "../net/protocol";
import { session, type Profile } from "../session";
import { enterFullscreen } from "./fullscreen";
import { Icon, Portrait } from "./icons";
import { AchievementGallery } from "./meta/AchievementGallery";
import { BotLadder } from "./meta/BotLadder";
import { DailyChallenges } from "./meta/DailyChallenges";
import { LegendPanel } from "./meta/LegendPanel";
import { metaStore } from "./meta/meta-store";
import { loadProfile, saveProfile } from "./profile";
import { store, useHud } from "./store";

const DEFAULT_CONFIG: MatchConfig = {
  teams: 2,
  playersPerTeam: 2,
  sharing: "separateWithTribute",
  difficulty: "normal",
  mapSize: "medium",
};

export function Menu() {
  const error = useHud((s) => s.error);
  const [profile, setProfile] = useState<Profile>(loadProfile);
  const [config, setConfig] = useState<MatchConfig>(DEFAULT_CONFIG);
  const [lobbies, setLobbies] = useState<MatchSummary[]>([]);

  useEffect(() => {
    metaStore.refresh();
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = () => api.list().then((list) => active && setLobbies(list), () => active && setLobbies([]));
    void refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const update = (patch: Partial<Profile>) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    saveProfile(next);
  };
  const patchConfig = (patch: Partial<MatchConfig>) => setConfig({ ...config, ...patch });

  return (
    <div className="menu">
      <header className="menu-title">
        <h1>Crownfall</h1>
        <p>Gather, build, raise a hero and break the enemy crown.</p>
      </header>
      {error && (
        <div className="banner banner-error" onClick={() => store.set({ error: null })}>
          {error}
        </div>
      )}
      <div className="menu-grid">
        <section className="panel">
          <h2>Your banner</h2>
          <label className="field">
            Name
            <input value={profile.name} maxLength={16} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <div className="races">
            {content.races.map((race) => (
              <button key={race.id} className={`race ${profile.race === race.id ? "active" : ""}`} onClick={() => update({ race: race.id })}>
                <span className="race-icon"><Portrait id={race.hero} /></span>
                <strong>{race.name}</strong>
                <small>{race.description}</small>
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary btn-big"
            onClick={() => {
              enterFullscreen();
              void session.quickPlay(profile);
            }}
          >
            <Icon id="battle" /> Quick Play
          </button>
          <p className="hint">Drops you into a 2v2 now. Bots hold every empty seat and hand it over when a player joins.</p>
          <button
            className="btn tutorial-button"
            onClick={() => {
              enterFullscreen();
              void session.tutorial(profile);
            }}
          >
            <Icon id="points" /> Tutorial
          </button>
          <p className="hint">A guided match against a bot that never attacks: build, train, fight a wolf camp and upgrade.</p>
          <h3>Sound</h3>
          <VolumeSliders />
        </section>

        <section className="panel">
          <h2>Custom game</h2>
          <div className="form-grid">
            <Select label="Teams" value={config.teams} options={[2, 3, 4]} onChange={(v) => patchConfig({ teams: Number(v) })} />
            <Select label="Players per team" value={config.playersPerTeam} options={[1, 2, 3, 4]} onChange={(v) => patchConfig({ playersPerTeam: Number(v) })} />
            <Select
              label="Resources"
              value={config.sharing}
              options={[
                ["separate", "Separate"],
                ["separateWithTribute", "Separate + tribute"],
                ["shared", "Shared team pool"],
              ]}
              onChange={(v) => patchConfig({ sharing: v as MatchConfig["sharing"] })}
            />
            <Select label="Bot skill" value={config.difficulty} options={[["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"], ["brutal", "Brutal"]]} onChange={(v) => patchConfig({ difficulty: v as MatchConfig["difficulty"] })} />
            <Select label="Map" value={config.mapSize} options={[["small", "Small"], ["medium", "Medium"], ["large", "Large"]]} onChange={(v) => patchConfig({ mapSize: v as MatchConfig["mapSize"] })} />
          </div>
          <button
            className="btn"
            onClick={() => {
              enterFullscreen();
              void session.create(config, profile);
            }}
          >
            Create lobby
          </button>
          <h3>Open lobbies</h3>
          {lobbies.length === 0 && <p className="hint">No open lobbies. Create one and share the link.</p>}
          <ul className="lobbies">
            {lobbies.map((lobby) => (
              <li key={lobby.id}>
                <span>
                  <strong>{lobby.hostName ?? "Lobby"}</strong> · {lobby.config.teams} teams × {lobby.config.playersPerTeam} · {lobby.openSeats} open
                </span>
                <button
                  className="btn btn-small"
                  onClick={() => {
                    enterFullscreen();
                    void session.join(lobby.id, profile);
                  }}
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Your legend</h2>
          <LegendPanel name={profile.name} race={profile.race} />
          <h3>Bot ladder</h3>
          <BotLadder
            onFight={(difficulty) => {
              enterFullscreen();
              void session.create({ teams: 2, playersPerTeam: 1, sharing: "separate", difficulty, mapSize: "small" }, profile);
            }}
          />
        </section>

        <section className="panel">
          <h2>Daily challenges</h2>
          <DailyChallenges />
          <h3>Achievements</h3>
          <AchievementGallery />
        </section>

        <section className="panel help">
          <h2>How to play</h2>
          <ul>
            <li><b>Click</b> select · <b>Right-click</b> move, gather, attack, build · <b>Right-drag</b> box-select troops · <b>Drag</b>, two-finger swipe or arrows move the map · pinch or wheel zooms</li>
            <li><b>Villagers</b>: H house · S storehouse · F farm · B barracks · T tower · C town center</li>
            <li><b>Buildings</b>: Z X C V train · U upgrade, up to level 3 · Backspace cancel · right-click sets the rally point</li>
            <li><b>Hero</b>: Q Cleave · W Rally · E Charge · R Doomfall, cast at the cursor · hold Space to follow your hero · spend a stat point every level</li>
            <li><b>Army</b>: A attack-move · X stop · Ctrl+1-9 groups · . idle villager · Esc deselect · Tab scores</li>
            <li>Kill creeps and enemies to level your hero; every level grows its health and attack more than the last and shortens its ability cooldowns. A fallen hero is revived for resources at a town center. Lose every town center and villager and you are out; the last team standing wins.</li>
            <li>Gold mines run dry for good; after that gold comes from creeps, market trades and enemy heroes, which pay more the higher their level. Upgraded barracks train Veteran and Elite troops.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string | number;
  options: (string | number | [string | number, string])[];
  onChange(value: string): void;
}

function Select({ label, value, options, onChange }: SelectProps) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => {
          const [v, text] = Array.isArray(option) ? option : [option, String(option)];
          return (
            <option key={v} value={v}>
              {text}
            </option>
          );
        })}
      </select>
    </label>
  );
}
