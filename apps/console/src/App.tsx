import { DEMO_BUYER, type AppAuth, type JobFeed } from "@kachel/db";
import { SignIn, useSession } from "@kachel/ui";
import { useMemo } from "react";
import { JobForm } from "./jobs/JobForm";
import { JobTable } from "./jobs/JobTable";
import { withSubmitted, type SubmitJob } from "./jobs/submit";

type Props = { feed: JobFeed; submit: SubmitJob; auth: AppAuth; local: boolean };

/**
 * Console app: the compute buyer's view of jobs, where they ran and the heat they gave.
 * Row level security shows a buyer only their own jobs, so the console asks them to sign in.
 */
export function App({ feed, submit, auth, local }: Props) {
  const email = useSession(auth);
  // A submitted job shows at once; Realtime then brings every later change to it.
  const live = useMemo(() => withSubmitted(feed), [feed]);
  const submitAndShow: SubmitJob = async (job) => {
    const row = await submit(job);
    live.announce(row);
    return row;
  };
  return (
    <main className="min-h-screen bg-fill font-sans text-label">
      <header className="border-b border-separator bg-white">
        <nav className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold tracking-tight">Kachel</h1>
          <span className="text-[15px] text-secondary">Buyer console</span>
          {email && (
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="ml-auto text-[15px] text-action hover:underline"
            >
              Sign out
            </button>
          )}
        </nav>
      </header>
      {email === null && (
        <div className="px-4 py-6 sm:py-10">
          <SignIn
            auth={auth}
            heading="Sign in to see your jobs"
            {...(local ? { demo: DEMO_BUYER } : {})}
          />
        </div>
      )}
      {email && (
        <div key={email} className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
          <JobForm submit={submitAndShow} />
          <JobTable feed={live.feed} />
        </div>
      )}
    </main>
  );
}
