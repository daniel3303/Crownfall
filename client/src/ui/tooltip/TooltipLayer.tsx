import { useLayoutEffect, useRef, useState } from "react";
import { useHud } from "../store";
import { hideTip } from "./use-tip";

const GAP_PX = 10;
const MARGIN_PX = 8;

/** Draws the open tooltip above its anchor (below when there is no room), kept inside the window. */
export function TooltipLayer() {
  const tip = useHud((s) => s.tip);
  const box = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    setPosition(null);
    if (!tip) return;
    let frame = 0;
    const place = () => {
      // The anchor can vanish without a pointerleave when the HUD re-renders under the cursor.
      if (!tip.anchor.isConnected) {
        hideTip();
        return;
      }
      const el = box.current;
      if (el) {
        const anchor = tip.anchor.getBoundingClientRect();
        const width = el.offsetWidth;
        const height = el.offsetHeight;
        const above = anchor.top - height - GAP_PX;
        const top = above >= MARGIN_PX ? above : anchor.bottom + GAP_PX;
        const left = Math.min(window.innerWidth - width - MARGIN_PX, Math.max(MARGIN_PX, anchor.left + anchor.width / 2 - width / 2));
        setPosition((old) => (old && old.left === left && old.top === top ? old : { left, top }));
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [tip]);

  if (!tip) return null;
  return (
    <div ref={box} className="tooltip" style={position ? { left: position.left, top: position.top } : { visibility: "hidden" }} role="tooltip">
      {tip.content}
    </div>
  );
}
