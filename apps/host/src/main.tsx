import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { supabaseChatData } from "./chat/data";
import { ollama } from "./chat/model";
import { db } from "./db";
import { isLocalStack, supabaseAuth, supabaseFeed, supabaseHouseFeed } from "@kachel/db";
import "./index.css";

const feed = supabaseFeed(db);
const house = supabaseHouseFeed(db);
const chat = {
  model: ollama({
    url: import.meta.env.VITE_OLLAMA_URL ?? "http://localhost:11434",
    model: import.meta.env.VITE_OLLAMA_MODEL ?? "qwen3:4b",
  }),
  data: supabaseChatData(db, house, feed),
};

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <App
      feed={feed}
      house={house}
      auth={supabaseAuth(db)}
      local={isLocalStack(import.meta.env.VITE_SUPABASE_URL)}
      chat={chat}
    />
  </StrictMode>,
);
