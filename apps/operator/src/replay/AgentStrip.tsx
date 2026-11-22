import { verdict } from "@kachel/ui";
import { href } from "../shell/route";
import { card } from "../ui";
import type { Agent } from "./replay";

/**
 * A one-line strip on Today: the scheduler's newest decision, its reason and hash. Live says live
 * only with Realtime running; otherwise it says it is a replay, and of which day.
 */
export function AgentStrip({ agent }: { agent: Agent }) {
  const d = agent.decisions[0];
  return (
    <section
      aria-label="Agent"
      data-agent={agent.mode}
      className={`${card} mt-4 flex flex-col gap-1 px-4 py-3 text-[14px] sm:flex-row sm:items-center sm:gap-4 sm:px-5`}
    >
      <p className="flex shrink-0 items-center gap-2 font-semibold">
        {agent.mode === "live" ? (
          <>
            <span className="inline-block size-2 rounded-full bg-green" aria-hidden />
            Agent, live
          </>
        ) : (
          <>
            <span className="inline-block size-2 rounded-full bg-grey" aria-hidden />
            <span data-replay-label>Replay of the scheduler&apos;s decisions, {agent.day}</span>
          </>
        )}
      </p>
      {d ? (
        <p className="min-w-0 flex-1 text-label-2 sm:truncate" aria-live="polite">
          <span className="text-label tabular-nums">{d.time.slice(11, 16)}</span> ·{" "}
          <span className="text-label">{verdict(d)}</span> · because {d.reason} ·{" "}
          <code className="font-mono text-[12px]">{d.hash.slice(0, 12)}</code>
        </p>
      ) : (
        <p className="flex-1 text-label-2">
          {agent.mode === "live" && agent.status === "error"
            ? "The decisions cannot be read right now."
            : "No decision yet. Start the loop with make live."}
        </p>
      )}
      <a href={href("jobs")} className="shrink-0 text-blue">
        Open in Jobs
      </a>
    </section>
  );
}
