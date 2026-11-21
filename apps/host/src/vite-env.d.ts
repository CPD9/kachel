/// <reference types="vite/client" />

/** What this app reads from .env (see .env.example). */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** The local Ollama for the chat (#26); only this computer is allowed. */
  readonly VITE_OLLAMA_URL?: string;
  readonly VITE_OLLAMA_MODEL?: string;
}
