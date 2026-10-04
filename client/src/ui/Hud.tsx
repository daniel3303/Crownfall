import type { RefObject } from "react";
import { CommandCard } from "./hud/CommandCard";
import { HeroPanel } from "./hud/HeroPanel";
import { Minimap } from "./hud/Minimap";
import { Notices } from "./hud/Notices";
import { Scoreboard } from "./hud/Scoreboard";
import { SelectionPanel } from "./hud/SelectionPanel";
import { TopBar } from "./hud/TopBar";
import { useHud } from "./store";

export function Hud({ minimapRef }: { minimapRef: RefObject<HTMLCanvasElement | null> }) {
  const scoreboard = useHud((s) => s.scoreboard);
  return (
    <div className="hud">
      <TopBar />
      <Notices />
      <div className="hud-bottom">
        <HeroPanel />
        <SelectionPanel />
        <CommandCard />
        <Minimap canvasRef={minimapRef} />
      </div>
      {scoreboard && <Scoreboard />}
    </div>
  );
}
