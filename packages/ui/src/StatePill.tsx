export type JobState = "QUEUED" | "RUNNING" | "PAUSED" | "MOVED" | "DONE";

const LABELS: Record<JobState, string> = {
  QUEUED: "Queued",
  RUNNING: "Running",
  PAUSED: "Paused",
  MOVED: "Moved",
  DONE: "Done",
};

/** Apple's system colours: green runs, grey waits, orange is still looking for a house. */
const STYLES: Record<Exclude<JobState, "DONE">, { pill: string; dot: string }> = {
  QUEUED: { pill: "bg-[#fff3e0]", dot: "bg-[#ff9500]" },
  RUNNING: { pill: "bg-[#e8f8ec]", dot: "bg-[#34c759]" },
  PAUSED: { pill: "bg-[#f2f2f7]", dot: "bg-[#8e8e93]" },
  MOVED: { pill: "bg-[#fff3e0]", dot: "bg-[#ff9500]" },
};

/** A job's state as a small label with a coloured dot; a finished job is plain text. */
export function StatePill({ state }: { state: JobState }) {
  if (state === "DONE") {
    return (
      <span data-state={state} className="text-sm text-[#6e6e73]">
        {LABELS[state]}
      </span>
    );
  }
  return (
    <span
      data-state={state}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-[#1d1d1f] ${STYLES[state].pill}`}
    >
      <span aria-hidden className={`size-1.5 rounded-full ${STYLES[state].dot}`} />
      {LABELS[state]}
    </span>
  );
}
