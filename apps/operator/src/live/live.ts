import {
  EMPTY,
  supabaseBuyers,
  watch,
  type AppAuth,
  type JobFeed,
  type LiveBuyer,
  type LiveJob,
  type LiveState,
} from "@kachel/db";
import { useSession } from "@kachel/ui";
import { useEffect, useState } from "react";

/** A house in the database with where it is, for the map. */
export interface PlacedSite {
  id: string;
  name: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
}

/** What the operator reads from Supabase: the same feed as the other apps, plus buyers and places. */
export interface OperatorSource {
  auth: AppAuth;
  feed: JobFeed;
  buyers(): Promise<LiveBuyer[]>;
  places(): Promise<PlacedSite[]>;
  /** True on the local stack, where the seed's operator account exists. */
  local: boolean;
}

export type Live = {
  email: string | null | undefined;
  status: LiveState["status"];
  buyers: LiveBuyer[];
  places: PlacedSite[];
  state: LiveState;
};

/** Signed in as an operator: every buyer, house and job, with jobs and servers kept live. */
export function useLive(source: OperatorSource | undefined): Live {
  const email = useSession(source?.auth ?? NO_AUTH);
  const [state, setState] = useState(EMPTY);
  const [buyers, setBuyers] = useState<LiveBuyer[]>([]);
  const [places, setPlaces] = useState<PlacedSite[]>([]);
  useEffect(() => {
    if (!source || !email) return;
    let current = true;
    const stop = watch(source.feed, setState);
    Promise.all([source.buyers(), source.places()]).then(
      ([b, p]) => {
        if (current) {
          setBuyers(b);
          setPlaces(p);
        }
      },
      () => current && setState((s) => ({ ...s, status: "error" })),
    );
    return () => {
      current = false;
      stop();
    };
  }, [source, email]);
  return { email, status: state.status, buyers, places, state };
}

const NO_AUTH: AppAuth = {
  current: () => Promise.resolve(null),
  onChange: () => () => undefined,
  signIn: () => Promise.resolve(false),
  signOut: () => Promise.resolve(),
};

export { supabaseBuyers };

/** One buyer's jobs, counted by state, and the server-hours they ordered. */
export interface BuyerRow {
  buyer: LiveBuyer;
  jobs: LiveJob[];
  running: number;
  paused: number;
  queued: number;
  done: number;
  offsite: number;
  serverHours: number;
}

export function buyerRows(buyers: LiveBuyer[], jobs: Iterable<LiveJob>): BuyerRow[] {
  const all = [...jobs];
  return buyers
    .map((buyer) => {
      const mine = all.filter((j) => j.buyer_id === buyer.id);
      return {
        buyer,
        jobs: mine,
        running: mine.filter((j) => j.state === "RUNNING").length,
        paused: mine.filter((j) => j.state === "PAUSED").length,
        queued: mine.filter((j) => j.state === "QUEUED").length,
        done: mine.filter((j) => j.state === "GONE" && !j.moved_offsite).length,
        offsite: mine.filter((j) => j.moved_offsite).length,
        serverHours: mine.reduce((s, j) => s + (j.server_hours ?? 0), 0),
      };
    })
    .sort((a, b) => b.running - a.running || a.buyer.name.localeCompare(b.buyer.name));
}
