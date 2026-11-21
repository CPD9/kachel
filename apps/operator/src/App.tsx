import { HeatLoop } from "@kachel/ui";
import { Fleet } from "./fleet/Fleet";

/**
 * Operator app: the business view of the whole system. Every house, what it runs and needs,
 * and the money, for any month of the year and a warmer or colder one.
 */
export function App() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-idle/40 px-4 py-4 sm:px-6">
        <HeatLoop variant="wide" className="h-12 w-auto shrink-0 sm:h-16" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Kachel operator</h1>
          <p className="text-sm text-muted">Every house, every server, the heat and the money.</p>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6">
        <Fleet />
      </div>
    </main>
  );
}
