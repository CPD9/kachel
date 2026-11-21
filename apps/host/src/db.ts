import { createKachelClient } from "@kachel/db";

/** The typed Supabase client for this app, on the anon or publishable key from .env. */
export const db = createKachelClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
