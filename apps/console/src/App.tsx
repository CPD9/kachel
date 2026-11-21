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
    <main className="min-h-screen bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-idle/40 px-6 py-4">
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Kachel console</h1>
          <p className="text-sm text-idle">
            Your jobs, the homes they heat and the heat they give.
          </p>
        </div>
        {email && (
          <div className="text-right text-sm">
            <p className="text-idle">{email}</p>
            <button type="button" onClick={() => void auth.signOut()} className="underline">
              Sign out
            </button>
          </div>
        )}
      </header>
      {email === null && (
        <SignIn
          auth={auth}
          heading="Sign in to see your jobs"
          {...(local ? { demo: DEMO_BUYER } : {})}
        />
      )}
      {email && (
        <div key={email}>
          <JobForm submit={submitAndShow} />
          <JobTable feed={live.feed} />
        </div>
      )}
    </main>
  );
}
