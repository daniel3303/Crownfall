import { useState } from "react";
import type { Bus } from "./catalog";
import { audio } from "./index";

const PERCENT = 100;
const ROWS: { bus: Bus; label: string }[] = [
  { bus: "music", label: "Music" },
  { bus: "ambience", label: "Ambience" },
  { bus: "effects", label: "Effects" },
];

/** Music, ambience and effects volume, saved per viewer; letting go of the effects slider plays a sample. */
export function VolumeSliders() {
  const [volumes, setVolumes] = useState(() => ({ ...audio.volumes }));
  const change = (bus: Bus, percent: number) => {
    audio.setVolume(bus, percent / PERCENT);
    setVolumes({ ...audio.volumes });
  };
  return (
    <div className="volume-sliders">
      {ROWS.map(({ bus, label }) => {
        const percent = Math.round(volumes[bus] * PERCENT);
        return (
          <label key={bus} className="volume-row">
            <span>{label}</span>
            <input
              type="range"
              min={0}
              max={PERCENT}
              value={percent}
              aria-label={`${label} volume`}
              onChange={(e) => change(bus, Number(e.target.value))}
              onPointerUp={() => bus === "effects" && audio.play("coin")}
            />
            <output>{percent}</output>
          </label>
        );
      })}
    </div>
  );
}
