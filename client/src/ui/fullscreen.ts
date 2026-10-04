const KEY = "crownfall.fullscreen";

interface KeyboardLock {
  lock?(keys: string[]): Promise<void>;
}

export function fullscreenPreferred(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

function remember(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Storage can be blocked; the choice then lasts for this visit only.
  }
}

/**
 * Goes fullscreen when the player prefers it. Call it from a click: browsers allow fullscreen only inside a
 * user gesture. Fullscreen gives the battlefield the whole screen and keeps Esc for the game.
 */
export function enterFullscreen(): void {
  if (fullscreenPreferred()) request();
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    remember(false);
    void document.exitFullscreen();
  } else {
    remember(true);
    request();
  }
}

function request(): void {
  const root = document.documentElement;
  if (document.fullscreenElement || !root.requestFullscreen) return;
  root
    .requestFullscreen({ navigationUI: "hide" })
    // Escape then reaches the game (cancel placement); holding it still leaves fullscreen.
    .then(() => (navigator as Navigator & { keyboard?: KeyboardLock }).keyboard?.lock?.(["Escape"]))
    .catch((error: unknown) => console.info("Fullscreen unavailable, playing windowed.", error));
}
