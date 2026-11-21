import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { db } from "./db";
import { supabaseFeed } from "./live/feed";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <App feed={supabaseFeed(db)} />
  </StrictMode>,
);
