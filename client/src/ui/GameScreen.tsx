import { useEffect, useRef } from "react";
import { session } from "../session";
import { EndScreen } from "./EndScreen";
import { Hud } from "./Hud";
import { useHud } from "./store";
import { HoverLabel } from "./tooltip/HoverLabel";
import { TooltipLayer } from "./tooltip/TooltipLayer";
import { TutorialOverlay } from "./tutorial/TutorialOverlay";

export function GameScreen() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const minimap = useRef<HTMLCanvasElement>(null);
  const end = useHud((s) => s.end);
  const loading = useHud((s) => s.loading);
  const loadError = useHud((s) => s.loadError);
  const tutorial = useHud((s) => s.match?.config.difficulty === "passive");

  useEffect(() => {
    if (canvas.current && overlayRef.current && minimap.current) {
      session.attach(canvas.current, overlayRef.current, minimap.current);
    }
  }, []);

  return (
    <div className="game">
      <canvas ref={canvas} className="game-canvas" />
      <canvas ref={overlayRef} className="game-overlay" />
      <Hud minimapRef={minimap} />
      <HoverLabel />
      <TooltipLayer />
      {tutorial && !end && <TutorialOverlay />}
      {loading && <div className="splash game-loading">Raising the banners…</div>}
      {loadError && (
        <div className="splash game-loading game-load-error">
          <p>{loadError}</p>
          <button className="btn" onClick={() => session.leave()}>
            Back to menu
          </button>
        </div>
      )}
      {end && <EndScreen end={end} />}
    </div>
  );
}
