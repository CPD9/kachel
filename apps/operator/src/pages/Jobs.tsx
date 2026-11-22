import { useMemo, useState } from "react";
import { SEED_BUYERS, SEED_SITES, seedJobs } from "../jobs/seed";
import { JobsTable, type JobTableData } from "../jobs/JobsTable";
import { Buyers } from "../live/Buyers";
import type { BuyerRow, Live, OperatorSource } from "../live/live";
import { Why } from "../live/Why";
import { href } from "../shell/route";
import { PageHead, Sources } from "../shell/Shell";
import { primary } from "../ui";

/**
 * Every job, and the buyers and why the scheduler decided as it did. Signed in on the local stack
 * the rows are live from Supabase; without it (Vercel) they are the seed's synthetic jobs, said so.
 */
export function Jobs({
  live,
  rows,
  source,
}: {
  live: Live;
  rows: BuyerRow[];
  source: OperatorSource | undefined;
}) {
  const [now] = useState(() => Date.now());
  const isLive = Boolean(live.email) && live.status === "live" && live.state.jobs.size > 0;
  const data: JobTableData = useMemo(() => {
    if (isLive)
      return {
        jobs: [...live.state.jobs.values()],
        buyers: live.buyers,
        sites: live.state.sites,
        servers: live.state.servers,
      };
    const seed = seedJobs(now);
    return {
      jobs: seed.jobs,
      buyers: SEED_BUYERS,
      sites: new Map(SEED_SITES.map((s) => [s.id, s])),
      servers: new Map(seed.servers.map((s) => [s.id, s])),
    };
  }, [isLive, live.state, live.buyers, now]);
  const running = data.jobs.filter((j) => j.state === "RUNNING").length;
  const caption = isLive
    ? `${data.jobs.length} jobs, ${running} running · live from Supabase · synthetic buyers`
    : `${data.jobs.length} jobs, ${running} running · synthetic rows from the seed, not live`;

  return (
    <>
      <PageHead
        title="Jobs"
        action={
          <a href={href("quotes")} className={primary}>
            New quote
          </a>
        }
      />
      <div className="mt-6">
        <JobsTable data={data} now={now} caption={caption} />
        <Sources>
          <p>
            {isLive
              ? "public.jobs, public.servers and public.sites in Supabase, read as the operator and kept live over Realtime."
              : "The local stack's seed (supabase/seed.sql): the same synthetic buyers, houses and jobs, timed from when this page opened. Run make dev and sign in under Compute buyers for the live rows."}{" "}
            Heat delivered: the job&apos;s run time × the server&apos;s 1 kW × 0.8 heat recovery
            (config.json: server). No buyer is a real customer.
          </p>
        </Sources>
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Buyers live={live} rows={rows} source={source} />
        {source?.decisions && <Why feed={source.decisions} signedIn={Boolean(live.email)} />}
      </div>
    </>
  );
}
