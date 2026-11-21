/// <reference types="vite/client" />

/** What this app reads from .env (see .env.example). */
interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
}
