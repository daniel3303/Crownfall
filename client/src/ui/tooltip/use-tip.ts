import type { PointerEvent, ReactNode } from "react";
import { store } from "../store";

/** Long enough that sweeping the mouse across the HUD does not flash tooltips, short enough to feel instant. */
const SHOW_DELAY_MS = 220;

let pending: ReturnType<typeof setTimeout> | undefined;

export function hideTip(): void {
  clearTimeout(pending);
  if (store.get().tip) store.set({ tip: null });
}

/** Pointer handlers that explain an element after a short hover. Spread them onto any HUD control. */
export function tipProps(content: () => ReactNode) {
  return {
    onPointerEnter: (event: PointerEvent<HTMLElement>) => {
      const anchor = event.currentTarget;
      clearTimeout(pending);
      // Once one tooltip is open, moving to the next control swaps it immediately, as in most games.
      const delay = store.get().tip ? 0 : SHOW_DELAY_MS;
      pending = setTimeout(() => store.set({ tip: { content: content(), anchor } }), delay);
    },
    onPointerLeave: hideTip,
    onPointerDown: hideTip,
  };
}
