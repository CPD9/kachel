/**
 * A short guided tour for the stage: a list of steps, each with a caption, run one after another.
 * Waiting inside a step counts only while the tour is not paused, so pausing on stage holds the
 * picture; stopping ends the tour at the next check.
 */
export interface TourStep {
  readonly caption: string;
  run(ctx: TourContext): Promise<void>;
}

export interface TourContext {
  /** Waits this long, not counting time spent paused; throws once the tour is stopped. */
  dwell(ms: number): Promise<void>;
  /** Waits for a promise, but no longer than `capMs` (slow tiles never stall the tour). */
  atMost(job: Promise<unknown>, capMs: number): Promise<void>;
}

export type TourState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" | "paused"; readonly step: number; readonly caption: string }
  | { readonly kind: "done" };

class Stopped extends Error {}

const TICK_MS = 100;

export function createTour(
  steps: readonly TourStep[],
  onState: (s: TourState) => void,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  let paused = false;
  /** Each start gets a new number; a run whose number is no longer current stops itself. */
  let run = 0;
  /** The run that stop() ended, so it alone reports idle. */
  let stoppedRun = -1;
  let current: { step: number; caption: string } | null = null;

  const report = () => {
    if (current === null) return;
    onState({ kind: paused ? "paused" : "running", ...current });
  };

  const contextFor = (me: number): TourContext => {
    const check = () => {
      if (me !== run) throw new Stopped();
    };
    return {
      async dwell(ms) {
        let left = ms;
        while (left > 0) {
          check();
          await wait(TICK_MS);
          if (!paused) left -= TICK_MS;
        }
        check();
      },
      async atMost(job, capMs) {
        check();
        let settled = false;
        void job.then(
          () => (settled = true),
          () => (settled = true),
        );
        let left = capMs;
        while (!settled && left > 0) {
          check();
          await wait(TICK_MS);
          left -= TICK_MS;
        }
        // Hold here while paused, so a pause during a flight holds the next stop too.
        while (paused) {
          check();
          await wait(TICK_MS);
        }
        check();
      },
    };
  };

  return {
    /** Starts the tour from the top; a run already going stops at its next check. */
    async start(): Promise<void> {
      paused = false;
      const me = ++run;
      const ctx = contextFor(me);
      try {
        for (const [i, step] of steps.entries()) {
          current = { step: i, caption: step.caption };
          report();
          await step.run(ctx);
        }
        current = null;
        onState({ kind: "done" });
      } catch (e) {
        if (!(e instanceof Stopped)) throw e;
        // Only a run that was stopped, with no newer run started since, reports idle; a run
        // replaced by a new start leaves the state to its successor.
        if (stoppedRun === me && run === me + 1) {
          current = null;
          onState({ kind: "idle" });
        }
      }
    },
    pause(): void {
      paused = true;
      report();
    },
    resume(): void {
      paused = false;
      report();
    },
    stop(): void {
      stoppedRun = run;
      run++;
    },
  };
}
