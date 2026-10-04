import type { RefObject } from "react";
import { Announcer } from "./hud/Announcer";
import { CommandCard } from "./hud/CommandCard";
import { HeroPanel } from "./hud/HeroPanel";
import { Minimap } from "./hud/Minimap";
import { Notices } from "./hud/Notices";
import { Scoreboard } from "./hud/Scoreboard";
import { SelectionPanel } from "./hud/SelectionPanel";
import { ShopPanel } from "./hud/ShopPanel";
import { TopBar } from "./hud/TopBar";
import { useHud } from "./store";

export function Hud({ minimapRef }: { minimapRef: RefObject<HTMLCanvasElement | null> }) {
  const scoreboard = useHud((s) => s.scoreboard);
  const shop = useHud((s) => s.shop);
  return (
    <div className="hud">
      <TopBar />
      <Announcer />
      <Notices />
      {shop && <ShopPanel />}
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
