import { describe, expect, it } from "vitest";
import { createTour, type TourState, type TourStep } from "./tour";

/** A clock that only moves when the tour waits, so tests run instantly. */
function fakeTime() {
  let now = 0;
  return {
    now: () => now,
    wait: async (ms: number) => {
      now += ms;
      await Promise.resolve();
    },
  };
}

describe("tour", () => {
  it("runs every step in order and ends", async () => {
    const t = fakeTime();
    const seen: string[] = [];
    const steps: TourStep[] = ["Basel", "Building", "Switzerland"].map((caption) => ({
      caption,
      run: async (ctx) => {
        seen.push(caption);
        await ctx.dwell(1000);
      },
    }));
    const states: TourState[] = [];
    await createTour(steps, (s) => states.push(s), t.wait).start();
    expect(seen).toEqual(["Basel", "Building", "Switzerland"]);
    expect(states.at(-1)).toEqual({ kind: "done" });
    expect(t.now()).toBe(3000);
  });

  it("does not count paused time against a dwell", async () => {
    const t = fakeTime();
    let tour: ReturnType<typeof createTour> | null = null;
    const steps: TourStep[] = [
      {
        caption: "hold",
        run: async (ctx) => {
          tour?.pause();
          await ctx.dwell(500);
        },
      },
    ];
    tour = createTour(steps, () => undefined, t.wait);
    const run = tour.start();
    // The stage holds for 2 s on the fake clock, then the presenter resumes.
    while (t.now() < 2000) await Promise.resolve();
    tour.resume();
    await run;
    // 2 s paused plus the 500 ms dwell, to within one 100 ms tick.
    expect(t.now()).toBeGreaterThanOrEqual(2400);
  });

  it("never waits longer than the cap for slow tiles", async () => {
    const t = fakeTime();
    const never = new Promise(() => undefined);
    const steps: TourStep[] = [{ caption: "tiles", run: (ctx) => ctx.atMost(never, 8000) }];
    await createTour(steps, () => undefined, t.wait).start();
    expect(t.now()).toBe(8000);
  });

  it("stops at the next check and reports idle", async () => {
    const t = fakeTime();
    const states: TourState[] = [];
    let tour: ReturnType<typeof createTour> | null = null;
    const steps: TourStep[] = [
      {
        caption: "long",
        run: async (ctx) => {
          tour?.stop();
          await ctx.dwell(10_000);
        },
      },
      { caption: "never", run: async () => undefined },
    ];
    tour = createTour(steps, (s) => states.push(s), t.wait);
    await tour.start();
    expect(states.at(-1)).toEqual({ kind: "idle" });
    expect(states.some((s) => s.kind === "running" && s.caption === "never")).toBe(false);
  });

  it("lets a new start replace a running tour without reporting idle", async () => {
    const t = fakeTime();
    const states: TourState[] = [];
    const steps: TourStep[] = [{ caption: "only", run: (ctx) => ctx.dwell(1000) }];
    const tour = createTour(steps, (s) => states.push(s), t.wait);
    const first = tour.start();
    tour.stop();
    const second = tour.start();
    await Promise.all([first, second]);
    expect(states.some((s) => s.kind === "idle")).toBe(false);
    expect(states.at(-1)).toEqual({ kind: "done" });
  });

  it("keeps the caption back until the stop is ready", async () => {
    const t = fakeTime();
    const seen: Array<[number, string]> = [];
    const steps: TourStep[] = [
      {
        caption: "Basel",
        run: async (ctx) => {
          await ctx.atMost(new Promise(() => undefined), 3000);
          ctx.show();
          await ctx.dwell(100);
        },
      },
    ];
    await createTour(
      steps,
      (s) => {
        if (s.kind === "running") seen.push([t.now(), s.caption]);
      },
      t.wait,
    ).start();
    expect(seen[0]).toEqual([0, "Getting the map ready…"]);
    expect(seen[1]).toEqual([3000, "Basel"]);
  });
});
