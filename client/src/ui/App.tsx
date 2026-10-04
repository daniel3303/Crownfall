import { useEffect } from "react";
import { session } from "../session";
import { GameScreen } from "./GameScreen";
import { LobbyScreen } from "./LobbyScreen";
import { Menu } from "./Menu";
import { loadProfile } from "./profile";
import { useHud } from "./store";

export function App() {
  const screen = useHud((s) => s.screen);

  useEffect(() => {
    const invite = new URLSearchParams(location.search).get("match");
    if (invite) {
      history.replaceState(null, "", location.pathname);
      void session.join(invite, loadProfile());
    }
  }, []);

  if (screen === "connecting") return <div className="splash">Riding to the battlefield…</div>;
  if (screen === "lobby") return <LobbyScreen />;
  if (screen === "game") return <GameScreen />;
  return <Menu />;
}
