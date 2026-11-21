import { StatePill, type JobState } from "@kachel/ui";

const STATES: JobState[] = ["RUNNING", "PAUSED", "MOVED", "DONE"];

/** Console app: the compute buyer's view of jobs, where they ran and the heat they gave. */
export function App() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="border-b border-idle/40 px-6 py-4">
        <h1 className="text-xl font-semibold">Kachel console</h1>
        <ul aria-label="Job states" className="mt-2 flex gap-2">
          {STATES.map((state) => (
            <li key={state}>
              <StatePill state={state} />
            </li>
          ))}
        </ul>
      </header>
    </main>
  );
}
