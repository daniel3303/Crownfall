import { AudioBoard } from "./board";

export type { Bus, SoundId } from "./catalog";

export const audio = new AudioBoard();

if (typeof window !== "undefined") {
  // The AudioContext may only start inside a user gesture; keep listening so an interrupted context resumes too.
  const unlock = () => audio.unlock();
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true, passive: true });
  if (import.meta.env.DEV) Object.assign(window, { crownfallAudio: audio });
}
