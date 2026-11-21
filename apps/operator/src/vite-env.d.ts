/// <reference types="vite/client" />

/** What this app reads from .env (see .env.example). */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
