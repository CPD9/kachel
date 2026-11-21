import { describe, expect, it } from "vitest";
import { createKachelClient, type KachelClient } from "./index";

// Runs against a live local stack only: the Database CI job sets these from
// `supabase status -o env` (see `pnpm --filter @kachel/db test:realtime`). Skipped elsewhere.
declare const process: { env: Record<string, string | undefined> };
const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Seed rows (supabase/seed.sql): the paused job on Server 4, and the reference house.
const SITE = "00000000-0000-4000-8000-000000000100";
const SERVER = "00000000-0000-4000-8000-000000000204";
const JOB = "00000000-0000-4000-8000-000000000304";

const WITHIN_MS = 2000;

type Table = "servers" | "jobs" | "heat_state";
type Heard = { table: Table; row: Record<string, unknown>; at: number };

/** Subscribe as an app would (anon key) and resolve once the channel is live. */
async function listen(app: KachelClient, heard: Heard[]) {
  const channel = app.channel("realtime-test");
  for (const table of ["servers", "jobs", "heat_state"] as const) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
      heard.push({ table, row: payload.new, at: performance.now() });
    });
  }
  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve();
      else if (status !== "CLOSED") reject(err ?? new Error(`Realtime channel ${status}`));
    });
  });
  return channel;
}

/** Wait until a change matching `match` is heard, or `ms` pass. */
async function hear(heard: Heard[], match: (h: Heard) => boolean, ms: number) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const found = heard.find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  return undefined;
}

describe.skipIf(!url || !anonKey || !serviceKey)("Realtime on servers, jobs and heat_state", () => {
  it("brings the agent's change to a subscribed app within two seconds", async () => {
    const app = createKachelClient(url, anonKey);
    const agent = createKachelClient(url, serviceKey);
    const heard: Heard[] = [];
    const channel = await listen(app, heard);
    try {
      // The channel can say SUBSCRIBED a moment before changes flow, so warm it up first:
      // write until one change arrives, then time the real ones.
      let warm = false;
      for (let i = 0; i < 20 && !warm; i++) {
        await agent.from("servers").update({ state: "PAUSED" }).eq("id", SERVER).throwOnError();
        warm = (await hear(heard, (h) => h.table === "servers", 500)) !== undefined;
      }
      expect(warm, "no Realtime change arrived within 10 s").toBe(true);
      heard.length = 0;

      const writes: [Table, () => PromiseLike<unknown>][] = [
        [
          "jobs",
          () => agent.from("jobs").update({ state: "RUNNING" }).eq("id", JOB).throwOnError(),
        ],
        [
          "servers",
          () => agent.from("servers").update({ state: "RUNNING" }).eq("id", SERVER).throwOnError(),
        ],
        [
          "heat_state",
          () =>
            agent
              .from("heat_state")
              .upsert({ site_id: SITE, time: "2025-01-14T00:00:00+01:00", demand_kwh: 9.8 })
              .throwOnError(),
        ],
      ];
      for (const [table, write] of writes) {
        const start = performance.now();
        await write();
        const got = await hear(heard, (h) => h.table === table, WITHIN_MS);
        expect(got, `${table}: no change within ${WITHIN_MS} ms`).toBeDefined();
        const delay = (got?.at ?? Infinity) - start;
        console.log(`Realtime: ${table} change heard after ${Math.round(delay)} ms`);
        expect(delay).toBeLessThan(WITHIN_MS);
      }
    } finally {
      await app.removeChannel(channel);
      await agent.from("jobs").update({ state: "PAUSED" }).eq("id", JOB);
      await agent.from("servers").update({ state: "PAUSED" }).eq("id", SERVER);
      await agent
        .from("heat_state")
        .delete()
        .eq("site_id", SITE)
        .eq("time", "2025-01-14T00:00:00+01:00");
    }
  }, 30_000);
});
