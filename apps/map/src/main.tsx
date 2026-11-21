import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createScene } from "./scene/viewer";
import "./index.css";

/** `?at=2026-11-21T16:30:00Z` opens the map paused at that moment, for screenshots and the demo. */
const atParam = new URLSearchParams(window.location.search).get("at");
const at = atParam === null || Number.isNaN(Date.parse(atParam)) ? null : new Date(atParam);

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <App start={(el) => createScene(el, { at })} />
  </StrictMode>,
);
