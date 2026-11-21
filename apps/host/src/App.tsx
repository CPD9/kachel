import { HeatLoop } from "@kachel/ui";
import type { JobFeed } from "./live/feed";
import { LiveJobs } from "./live/LiveJobs";

/** Host app: the homeowner's view of their house, its heat and its servers. */
export function App({ feed }: { feed: JobFeed }) {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-idle/40 px-6 py-4">
        <HeatLoop variant="wide" className="h-16 w-auto" />
        <div>
          <h1 className="text-xl font-semibold">Kachel</h1>
          <p className="text-sm text-idle">Your house, your heat, your servers.</p>
        </div>
      </header>
      <LiveJobs feed={feed} />
    </main>
  );
}
