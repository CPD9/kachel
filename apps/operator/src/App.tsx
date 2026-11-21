import { Dashboard } from "./fleet/Dashboard";
import type { OperatorSource } from "./live/live";

/**
 * Operator app: the business view of the whole system. Every home, what it runs and needs, the
 * buyers and their jobs, and the money, for any month of the year and a warmer or colder one.
 * Laid out for a 1920 × 1080 screen, in the dark look of the pitch app.
 */
export function App({ source }: { source?: OperatorSource }) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0e1013] text-white">
      <div className="mx-auto max-w-[1920px] px-4 py-5 sm:px-8">
        <Dashboard {...(source ? { source } : {})} />
      </div>
    </main>
  );
}
