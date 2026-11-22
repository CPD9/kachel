import type { LiveBuyer, LiveJob, LiveServer, LiveSite } from "@kachel/db";

/**
 * The local stack's synthetic buyers, houses and jobs (supabase/seed.sql), as plain data for the
 * console without a database (Vercel). Same ids, labels, hours and states as the seed; the test
 * checks them against seed.sql. None of it is live, and no buyer is a real customer.
 */
const id = (n: string) => `00000000-0000-4000-8000-${n.padStart(12, "0")}`;

export const SEED_BUYERS: LiveBuyer[] = [
  ["02", "Demo buyer", "AI batch, embeddings and chat sessions"],
  ["21", "Game streaming", "Gaming sessions on the house's GPU"],
  ["22", "3D rendering studio", "Overnight renders and animations"],
  ["23", "AI research lab", "Model training and batch inference"],
  ["24", "Video studio", "Editing exports and transcodes"],
  ["25", "Embeddings start-up", "An embeddings backlog with no deadline"],
  ["26", "Speech to text", "Transcription batches with a deadline"],
  ["27", "Rail operator", "Image and video tagging of station and track footage, overnight"],
].map(([n = "", name = "", buys = ""]) => ({ id: id(n), name, buys, synthetic: true }));

const HOUSES = [
  ["St. Johann", "Basel"],
  ["Gundeldingen", "Basel"],
  ["Matthäus", "Basel"],
  ["Bachletten", "Basel"],
  ["Iselin", "Basel"],
  ["Breite", "Basel"],
  ["Hirzbrunnen", "Basel"],
  ["Gotthelf", "Basel"],
  ["Länggasse", "Bern"],
  ["Breitenrain", "Bern"],
  ["Kirchenfeld", "Bern"],
  ["Bümpliz", "Bern"],
] as const;

const hh = (house: number) => String(house).padStart(2, "0");

export const SEED_SITES: LiveSite[] = HOUSES.map(([name, city], i) => ({
  id: id(`10${hh(i + 1)}`),
  name: `Synthetic house, ${name}`,
  city,
}));

type Row = [
  string,
  string,
  number | null,
  number | null,
  LiveJob["kind"],
  string,
  number | null,
  number | null,
  LiveJob["state"],
  number,
  number,
];

/** (id, buyer, house, slot, kind, label, hours, due_h, state, ran_h, age_min), as in seed.sql. */
export const SEED_JOB_ROWS: Row[] = [
  ["306", "02", 3, 1, "interactive", "Game session, evening", 4, null, "RUNNING", 1.5, 90],
  ["307", "02", 9, 1, "batch", "Render batch, 30 frames", 6, 16, "PAUSED", 2, 150],
  ["401", "21", 1, 1, "interactive", "Evening match, 4K (synthetic)", 3, null, "RUNNING", 1, 60],
  ["402", "21", 2, 1, "interactive", "Stream session (synthetic)", 4, null, "RUNNING", 2, 120],
  ["403", "21", 10, 1, "interactive", "Ranked match (synthetic)", 2, null, "RUNNING", 0.5, 30],
  ["404", "21", null, null, "interactive", "Late session (synthetic)", 2, null, "QUEUED", 0, 5],
  ["411", "22", 4, 1, "batch", "Facade renders, 40 frames (synthetic)", 6, 10, "RUNNING", 3, 200],
  ["412", "22", 4, 2, "batch", "Walkthrough animation (synthetic)", 12, 30, "PAUSED", 4, 300],
  ["413", "22", 5, 1, "batch", "Product stills (synthetic)", 2, null, "GONE", 2, 400],
  ["421", "23", 6, 1, "batch", "Fine-tune run, 7B (synthetic)", 16, 24, "RUNNING", 5, 330],
  ["422", "23", 6, 2, "batch", "Evaluation of the fine-tune (synthetic)", 4, 26, "RUNNING", 1, 70],
  ["423", "23", null, null, "batch", "Hyperparameter sweep (synthetic)", 24, 48, "QUEUED", 0, 20],
  [
    "424",
    "23",
    null,
    null,
    "batch",
    "Overnight batch inference (synthetic)",
    8,
    null,
    "GONE",
    0,
    600,
  ],
  ["431", "24", 11, 1, "batch", "Export: client film in 4K (synthetic)", 3, 8, "RUNNING", 1, 65],
  ["432", "24", 12, 1, "batch", "Proxy transcode (synthetic)", 1, null, "GONE", 1, 240],
  [
    "441",
    "25",
    5,
    2,
    "opportunistic",
    "Embeddings backlog, shard 1 (synthetic)",
    null,
    null,
    "RUNNING",
    6,
    500,
  ],
  [
    "442",
    "25",
    8,
    1,
    "opportunistic",
    "Embeddings backlog, shard 2 (synthetic)",
    null,
    null,
    "RUNNING",
    4,
    500,
  ],
  [
    "443",
    "25",
    7,
    1,
    "opportunistic",
    "Embeddings backlog, shard 3 (synthetic)",
    null,
    null,
    "PAUSED",
    2.5,
    500,
  ],
  [
    "451",
    "26",
    12,
    2,
    "batch",
    "Podcast archive transcription (synthetic)",
    8,
    20,
    "RUNNING",
    2,
    140,
  ],
  [
    "452",
    "26",
    null,
    null,
    "batch",
    "Council meetings transcription (synthetic)",
    5,
    24,
    "QUEUED",
    0,
    10,
  ],
  [
    "461",
    "27",
    3,
    2,
    "batch",
    "Image tagging: station photos (synthetic)",
    2,
    12,
    "RUNNING",
    0.5,
    45,
  ],
  [
    "462",
    "27",
    9,
    2,
    "batch",
    "Video tagging: track footage (synthetic)",
    2,
    24,
    "PAUSED",
    0.5,
    95,
  ],
  [
    "463",
    "27",
    null,
    null,
    "batch",
    "Video tagging: platform cameras (synthetic)",
    2,
    24,
    "QUEUED",
    0,
    15,
  ],
];

/** The seed's jobs and the servers they hold, timed from `now` as the seed times them from now(). */
export function seedJobs(now: number): { jobs: LiveJob[]; servers: LiveServer[] } {
  const iso = (ms: number) => new Date(ms).toISOString();
  const servers = new Map<string, LiveServer>();
  const jobs = SEED_JOB_ROWS.map(
    ([n, buyer, house, slot, kind, label, hours, dueH, state, ranH, ageMin]): LiveJob => {
      const holds = house !== null && slot !== null && state !== "QUEUED" && state !== "GONE";
      const serverId = holds ? id(`2${hh(house)}0${slot}`) : null;
      if (serverId && house !== null && slot !== null)
        servers.set(serverId, {
          id: serverId,
          site_id: id(`10${hh(house)}`),
          slot,
          name: `Server ${slot}`,
          state: state === "RUNNING" ? "RUNNING" : "PAUSED",
          power_kw: 1,
          heat_recovery: 0.8,
          updated_at: iso(now),
        });
      return {
        id: id(n),
        buyer_id: id(buyer),
        label,
        kind,
        state,
        site_id: house === null ? null : id(`10${hh(house)}`),
        server_id: serverId,
        server_hours: hours,
        deadline_at: dueH === null ? null : iso(now + dueH * 3_600_000),
        active_cpu_s: ranH * 3600,
        moved_offsite: house === null && state === "GONE",
        created_at: iso(now - ageMin * 60_000),
        updated_at: iso(now),
      };
    },
  );
  return { jobs, servers: [...servers.values()] };
}
