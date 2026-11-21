import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createScene } from "./scene/viewer";
import "./index.css";

/** `?at=2026-11-21T16:30:00Z` opens the map paused at that moment, for screenshots and the demo. */
const atParam = new URLSearchParams(window.location.search).get("at");
const at = atParam === null || Number.isNaN(Date.parse(atParam)) ? null : new Date(atParam);

/** `?tour=1` starts the stage tour as soon as the map is up. */
const autoTour = new URLSearchParams(window.location.search).get("tour") === "1";
/** `?tourcap=20000`: let each stop wait up to this many ms for tiles (slow machines, tests). */
const capParam = Number(new URLSearchParams(window.location.search).get("tourcap"));
const tourCapMs = Number.isFinite(capParam) && capParam > 0 ? capParam : undefined;

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <App start={(el) => createScene(el, { at })} autoTour={autoTour} tourCapMs={tourCapMs} />
  </StrictMode>,
);
