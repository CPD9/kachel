import type { JobFeed } from "@kachel/db";
import { JobTable } from "./jobs/JobTable";

/** Console app: the compute buyer's view of jobs, where they ran and the heat they gave. */
export function App({ feed }: { feed: JobFeed }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-idle/40 px-6 py-4">
        <h1 className="text-xl font-semibold">Kachel console</h1>
        <p className="text-sm text-idle">Your jobs, the homes they heat and the heat they give.</p>
      </header>
      <JobTable feed={feed} />
    </main>
  );
}
