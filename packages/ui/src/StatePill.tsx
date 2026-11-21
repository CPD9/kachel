export type JobState = "RUNNING" | "PAUSED" | "MOVED" | "DONE";

const LABELS: Record<JobState, string> = {
  RUNNING: "Running",
  PAUSED: "Paused: no heat sink",
  MOVED: "Moved",
  DONE: "Done",
};

const STYLES: Record<JobState, string> = {
  RUNNING: "bg-heat text-paper",
  PAUSED: "bg-paused text-ink",
  MOVED: "bg-heat-soft text-ink",
  DONE: "bg-idle text-paper",
};

/** A job's state as a small coloured label. */
export function StatePill({ state }: { state: JobState }) {
  return (
    <span
      data-state={state}
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STYLES[state]}`}
    >
      {LABELS[state]}
    </span>
  );
}
