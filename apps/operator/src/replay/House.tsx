import { Pill } from "../shell/Shell";
import { card } from "../ui";
import type { ReplayEntry } from "./replay";

/** The reference house's jobs and servers in supabase/seed.sql, as the log names them by id. */
const LABEL: Record<string, string> = {
  "00000000-0000-4000-8000-000000000301": "Embeddings backlog, part 1",
  "00000000-0000-4000-8000-000000000302": "Embeddings backlog, part 2",
  "00000000-0000-4000-8000-000000000303": "Transcription batch",
  "00000000-0000-4000-8000-000000000304": "Embeddings backlog, part 3",
  "00000000-0000-4000-8000-000000000305": "Evening chat session",
};
const serverName = (id: string) => `Server ${Number(id.slice(-3)) - 200}`;

type State = "Running" | "Paused" | "Queued" | "Placed";
const TONE: Record<State, "blue" | "orange" | "grey"> = {
  Running: "blue",
  Placed: "blue",
  Paused: "orange",
  Queued: "grey",
};

/** Each job on the reference house as the decision left it: run, paused, queued or just placed. */
export function houseAt(e: ReplayEntry) {
  const placed = new Map(e.placed.map((p) => [p.job, p]));
  const onServers = e.jobs.map((j) => ({
    id: j.id,
    label: LABEL[j.id] ?? j.id.slice(-12),
    kind: j.kind,
    server: serverName(j.server),
    state: (e.run.includes(j.id) ? "Running" : "Paused") as State,
  }));
  const queued = e.queue.map((q) => {
    const p = placed.get(q.id);
    return {
      id: q.id,
      label: LABEL[q.id] ?? q.id.slice(-12),
      kind: q.kind,
      server: p ? serverName(p.server) : "—",
      state: (p ? "Placed" : "Queued") as State,
    };
  });
  return [...onServers, ...queued];
}

/** The replayed hour on the reference house: which job runs, which waits, and what was placed. */
export function ReplayHouse({ entry }: { entry: ReplayEntry }) {
  const rows = houseAt(entry);
  return (
    <section aria-labelledby="replay-house" className={`${card} p-5`}>
      <h2 id="replay-house" className="text-[17px] font-semibold">
        Reference house at {entry.time.slice(11, 16)}
      </h2>
      <p className="mt-0.5 text-[14px] text-label-2">
        {entry.servers} servers · {entry.temp_c.toFixed(1).replace("-", "−")} °C outside · tank{" "}
        {entry.soc_kwh.toFixed(1)} of {entry.tank_kwh.toFixed(0)} kWh
      </p>
      <ul className="mt-3 divide-y divide-sep/60 border-t border-sep/60">
        {rows.map((r) => (
          <li
            key={r.id}
            data-replay-job={r.id}
            data-state={r.state}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span>
              <span className="font-semibold">{r.label}</span>
              <span className="block text-[13px] text-label-2">
                {r.kind === "opportunistic"
                  ? "Backlog"
                  : r.kind === "batch"
                    ? "Batch"
                    : "Interactive"}{" "}
                · {r.server}
              </span>
            </span>
            <Pill tone={TONE[r.state]}>
              {r.state === "Placed" ? `Placed on ${r.server}` : r.state}
            </Pill>
          </li>
        ))}
      </ul>
    </section>
  );
}
