import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { session } from "../../session";
import { TextTip } from "../tooltip/Tips";
import { tipProps } from "../tooltip/use-tip";

export function Minimap({ canvasRef }: { canvasRef: RefObject<HTMLCanvasElement | null> }) {
  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return session.game?.minimap.toMap(e.clientX - rect.left, e.clientY - rect.top);
  };
  const handle = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const target = point(e);
    if (!target) return;
    if (e.button === 2) session.game?.orderAt(target.x, target.y, undefined, false);
    else if (e.buttons & 1) session.game?.jumpTo(target.x, target.y);
  };
  return (
    <div className="minimap panel" {...tipProps(() => <TextTip title="Minimap" text="Click or drag to move the camera. Right-click to send the selected units there." />)}>
      <canvas ref={canvasRef} onPointerDown={handle} onPointerMove={handle} onContextMenu={(e) => e.preventDefault()} />
    </div>
  );
}
