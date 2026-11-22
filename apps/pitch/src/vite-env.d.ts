/// <reference types="vite/client" />

/** What this app reads from .env (see .env.example). */
interface ImportMetaEnv {
  readonly VITE_MAPBOX_TOKEN?: string;
  /** Where the map app runs, for the hand-over; http://localhost:5175 when unset. */
  readonly VITE_MAP_URL?: string;
}
