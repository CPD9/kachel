/** A logged decision of the live loop, as the decisions table holds it (@kachel/db: LiveDecision). */
export interface Decision {
  hash: string;
  prev_hash: string;
  seq: number;
  time: string;
  temp_c: number | null;
  demand_kwh: number;
  soc_kwh: number;
  tank_kwh: number;
  interactive: number;
  batch: number;
  opportunistic: number;
  reason: string;
  run: string[];
  placed: number;
  /** When the loop wrote it. A decision for an hour far from that is a replayed one. */
  written_at?: string;
}

const TONES = {
  light: {
    box: "rounded-lg border border-grid bg-paper p-5",
    muted: "text-muted",
    rule: "border-grid divide-grid",
    track: "bg-grid",
    fill: "bg-ember",
    code: "bg-grid/60",
    live: "bg-mint",
  },
  dark: {
    box: "rounded-[22px] border border-white/10 bg-[#1b1d21]/85 p-6",
    muted: "text-white/55",
    rule: "border-white/10 divide-white/10",
    track: "bg-white/10",
    fill: "bg-[#ff5a1f]",
    code: "bg-white/[0.08]",
    live: "bg-[#19b38a]",
  },
} as const;

const WHEN = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const servers = (n: number) => (n === 1 ? "1 server" : `${n} servers`);

/** True when the decision is for a stored day the loop replayed, not for the hour it was made. */
export function replayed(d: Decision): boolean {
  if (!d.written_at) return false;
  return Math.abs(Date.parse(d.written_at) - Date.parse(d.time)) > 36 * 3600 * 1000;
}
const short = (hash: string) => hash.slice(0, 12);

/** What the decision did with the backlog, and with sessions and batch when it ran any. */
export function verdict(d: Decision): string {
  const backlog =
    d.opportunistic > 0 ? `Backlog runs on ${servers(d.opportunistic)}` : "Backlog paused";
  const more = [
    d.interactive > 0 ? `${d.interactive} session${d.interactive === 1 ? "" : "s"}` : "",
    d.batch > 0 ? `${d.batch} batch` : "",
  ].filter(Boolean);
  return more.length ? `${backlog}; ${more.join(", ")} too` : backlog;
}

function Fact({ name, value, muted }: { name: string; value: string; muted: string }) {
  return (
    <div>
      <p className={`text-xs font-medium tracking-wide uppercase ${muted}`}>{name}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * "Why this decision": the live loop's newest decision with what it saw (time, outdoor
 * temperature, heat demand, tank), what it decided and why, and its place in the hash chain, then
 * the few before it. Anyone can replay the log with make verify-live.
 */
export function WhyDecision({
  decisions,
  status,
  tone = "light",
}: {
  /** Newest first. */
  decisions: Decision[];
  status: "loading" | "live" | "error";
  tone?: keyof typeof TONES;
}) {
  const t = TONES[tone];
  const [latest, ...before] = decisions;
  return (
    <section aria-labelledby="why-decision" className={t.box}>
      <h2 id="why-decision" className="flex items-center gap-2 text-lg font-semibold">
        Why this decision
        {status === "live" && latest && (
          <span className={`inline-block size-1.5 rounded-full ${t.live}`} aria-label="live" />
        )}
      </h2>
      <p className={`mt-1 text-xs ${t.muted}`}>
        The scheduler&apos;s live loop runs the same decide() as the yearly balance and pauses or
        resumes the jobs itself. Each decision is hashed onto the one before; make verify-live
        replays them all.
      </p>
      {status === "error" && (
        <p role="alert" className="mt-4 text-sm">
          The decisions cannot be read right now.
        </p>
      )}
      {status !== "error" && !latest && (
        <p className={`mt-4 text-sm ${t.muted}`}>
          {status === "loading"
            ? "Reading the decisions…"
            : "No decision yet. Start the loop with make live."}
        </p>
      )}
      {latest && (
        <div data-decision={latest.hash} className="mt-4">
          <p className="text-sm">
            <span className={t.muted}>
              {replayed(latest) && "Replayed hour: "}
              {WHEN.format(new Date(latest.time))} ·{" "}
            </span>
            <span className="font-semibold">{verdict(latest)}</span>
          </p>
          <p className="mt-1 text-sm">
            <span className={t.muted}>Because: </span>
            {latest.reason}
            {latest.placed > 0 && (
              <span className={t.muted}>
                {" "}
                · placed {latest.placed} queued job{latest.placed === 1 ? "" : "s"}
              </span>
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Fact
              name="Outdoor"
              value={latest.temp_c === null ? "–" : `${latest.temp_c.toFixed(1)} °C`}
              muted={t.muted}
            />
            <Fact name="Demand" value={`${latest.demand_kwh.toFixed(2)} kWh`} muted={t.muted} />
            <Fact
              name={`Tank of ${latest.tank_kwh.toFixed(0)}`}
              value={`${latest.soc_kwh.toFixed(1)} kWh`}
              muted={t.muted}
            />
            <Fact name="Jobs run" value={String(latest.run.length)} muted={t.muted} />
          </div>
          <div
            className={`mt-3 h-2 overflow-hidden rounded-full ${t.track}`}
            role="img"
            aria-label={`Tank ${Math.round((100 * latest.soc_kwh) / latest.tank_kwh)}% full`}
          >
            <div
              className={`h-full ${t.fill}`}
              style={{ width: `${Math.min(100, (100 * latest.soc_kwh) / latest.tank_kwh)}%` }}
            />
          </div>
          <p className={`mt-3 font-mono text-xs break-all ${t.muted}`}>
            #{latest.seq} sha256{" "}
            <code data-hash className={`rounded px-1 ${t.code}`}>
              {latest.hash}
            </code>{" "}
            after {short(latest.prev_hash)}
          </p>
        </div>
      )}
      {before.length > 0 && (
        <ol className={`mt-4 divide-y border-t text-xs ${t.rule}`}>
          {before.map((d) => (
            <li key={d.hash} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
              <span className={`w-28 tabular-nums ${t.muted}`}>
                {HOUR.format(new Date(d.time))}
              </span>
              <span className="flex-1">
                {verdict(d)} <span className={t.muted}>· {d.reason}</span>
              </span>
              <code className={`font-mono ${t.muted}`}>{short(d.hash)}</code>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
