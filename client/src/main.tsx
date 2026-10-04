import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { session } from "./session";
import { App } from "./ui/App";
import { store } from "./ui/store";
import "@fontsource-variable/inter";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import "./ui/styles.css";
import "./ui/meta/meta.css";

if (import.meta.env.DEV) Object.assign(window, { crownfall: { session, store } });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
