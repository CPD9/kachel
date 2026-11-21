import { createKachelClient, isLocalStack, supabaseAuth, supabaseFeed } from "@kachel/db";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { supabaseBuyers, type OperatorSource } from "./live/live";
import "./index.css";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** The live part needs Supabase; without a .env the model's figures still show. */
function connect(): OperatorSource | undefined {
  if (!url || !key) return undefined;
  const db = createKachelClient(url, key);
  return {
    auth: supabaseAuth(db),
    feed: supabaseFeed(db),
    buyers: () => supabaseBuyers(db),
    async places() {
      const { data, error } = await db
        .from("sites")
        .select("id, name, city, latitude, longitude")
        .order("name");
      if (error) throw new Error("Could not read the houses.");
      return data;
    },
    local: isLocalStack(url),
  };
}

const root = document.getElementById("root");
if (root === null) throw new Error("The page has no #root element.");
const source = connect();
createRoot(root).render(
  <StrictMode>
    <App {...(source ? { source } : {})} />
  </StrictMode>,
);
