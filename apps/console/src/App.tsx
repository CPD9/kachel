import type { JobFeed } from "@kachel/db";
import { useMemo } from "react";
import { JobForm } from "./jobs/JobForm";
import { JobTable } from "./jobs/JobTable";
import { withSubmitted, type SubmitJob } from "./jobs/submit";

/** Console app: the compute buyer's view of jobs, where they ran and the heat they gave. */
export function App({ feed, submit }: { feed: JobFeed; submit: SubmitJob }) {
  // A submitted job shows at once; Realtime then brings every later change to it.
  const live = useMemo(() => withSubmitted(feed), [feed]);
  const submitAndShow: SubmitJob = async (job) => {
    const row = await submit(job);
    live.announce(row);
    return row;
  };
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-idle/40 px-6 py-4">
        <h1 className="text-xl font-semibold">Kachel console</h1>
        <p className="text-sm text-idle">Your jobs, the homes they heat and the heat they give.</p>
      </header>
      <JobForm submit={submitAndShow} />
      <JobTable feed={live.feed} />
    </main>
  );
}
