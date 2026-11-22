import { NO_DECISIONS, watchDecisions } from "@kachel/db";
import type { Decision } from "@kachel/ui";
import { useEffect, useState } from "react";
import type { OperatorSource } from "../live/live";
import raw from "./decisions.json";

/**
 * The live loop's own decision log (services/scheduler/live.py, make live-demo) for 13 January
 * and 15 July 2025 on the reference house, baked by scripts/bake_replay.py after checking every
 * hash and link. On Vercel there is no database: the console replays these, and says so.
 */
export interface ReplayEntry {
  seq: number;
  hash: string;
  prev: string;
  at: string;
  time: string;
  temp_c: number;
  demand_kwh: number;
  soc_kwh: number;
  tank_kwh: number;
  servers: number;
  interactive: number;
  batch: number;
  opportunistic: number;
  reason: string;
  jobs: { id: string; kind: string; server: string }[];
  queue: { id: string; kind: string }[];
  run: string[];
  placed: { job: string; server: string; reason: string; to: string }[];
}

export const REPLAY: { source: string; site: string; entries: ReplayEntry[] } = raw;

/** As the decisions table holds it, so the shared "Why this decision" panel can show it. */
export const asDecision = (e: ReplayEntry): Decision => ({
  hash: e.hash,
  prev_hash: e.prev,
  seq: e.seq,
  time: e.time,
  temp_c: e.temp_c,
  demand_kwh: e.demand_kwh,
  soc_kwh: e.soc_kwh,
  tank_kwh: e.tank_kwh,
  interactive: e.interactive,
  batch: e.batch,
  opportunistic: e.opportunistic,
  reason: e.reason,
  run: e.run,
  placed: e.placed.length,
  written_at: e.at,
});

/** "13 January 2025", from the decision's own clock time. */
export function dayOf(time: string) {
  const [y, m, d] = time.slice(0, 10).split("-").map(Number);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y ?? 2025, (m ?? 1) - 1, d ?? 1)),
  );
  return `${d} ${month} ${y}`;
}

/** One replayed hour every 2.5 s, as make live-demo plays it: a day in a minute. */
export const STEP_MS = 2500;
/** One clock for every page, so moving between Today and Jobs does not restart the day. */
const EPOCH = Date.now();
const at = (now: number) => Math.floor((now - EPOCH) / STEP_MS) % REPLAY.entries.length;

export type Agent =
  | { mode: "live"; decisions: Decision[]; status: "loading" | "live" | "error" }
  | { mode: "replay"; decisions: Decision[]; entry: ReplayEntry; day: string };

/**
 * The scheduler's decisions: live over Realtime once the operator is signed in on the local
 * stack, otherwise the replay of its log. Never the replay dressed as live.
 */
export function useAgent(source: OperatorSource | undefined, signedIn: boolean, keep = 6): Agent {
  const feed = signedIn ? source?.decisions : undefined;
  const [live, setLive] = useState(NO_DECISIONS);
  const [i, setI] = useState(() => at(Date.now()));
  useEffect(() => (feed ? watchDecisions(feed, setLive, keep) : undefined), [feed, keep]);
  useEffect(() => {
    if (feed) return;
    const tick = setInterval(() => setI(at(Date.now())), 250);
    return () => clearInterval(tick);
  }, [feed]);
  if (feed) return { mode: "live", decisions: live.decisions, status: live.status };
  const entries = REPLAY.entries;
  const entry = entries[i] ?? entries[0];
  if (!entry) return { mode: "live", decisions: [], status: "error" };
  // The hours of the same day so far, newest first.
  const day = entry.time.slice(0, 10);
  const shown = entries
    .slice(0, i + 1)
    .filter((e) => e.time.startsWith(day))
    .reverse()
    .slice(0, keep)
    .map(asDecision);
  return { mode: "replay", decisions: shown, entry, day: dayOf(entry.time) };
}
