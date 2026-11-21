export type JobState = "QUEUED" | "RUNNING" | "PAUSED" | "MOVED" | "DONE";

const LABELS: Record<JobState, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  PAUSED: "Paused",
  MOVED: "Moved",
  DONE: "Done",
};

const STYLES: Record<JobState, string> = {
  QUEUED: "bg-paper text-ink ring-1 ring-inset ring-idle",
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
