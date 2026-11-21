import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { db } from "./db";
import { isLocalStack, supabaseAuth, supabaseFeed, supabaseHouseFeed } from "@kachel/db";
import "./index.css";

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <App
      feed={supabaseFeed(db)}
      house={supabaseHouseFeed(db)}
      auth={supabaseAuth(db)}
      local={isLocalStack(import.meta.env.VITE_SUPABASE_URL)}
    />
  </StrictMode>,
);
