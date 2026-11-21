import { describe, expect, it } from "vitest";
import {
  EMPTY,
  heatKwh,
  watch,
  type JobFeed,
  type LiveJob,
  type LiveServer,
  type LiveState,
} from "./index";

const server: LiveServer = {
  id: "s4",
  site_id: "h1",
  slot: 4,
  name: "Server 4",
  state: "RUNNING",
  power_kw: 1.0,
  heat_recovery: 0.8,
  updated_at: "2026-11-21T10:00:00+00:00",
};
const job: LiveJob = {
  id: "j304",
  label: "Embeddings backlog, part 3",
  kind: "opportunistic",
  state: "RUNNING",
  site_id: "h1",
  server_id: "s4",
  server_hours: null,
  deadline_at: null,
  active_cpu_s: 3600,
  created_at: "2026-11-21T09:00:00+00:00",
  updated_at: "2026-11-21T10:00:00+00:00",
};

/** A feed the test drives by hand, with a read it can let through when it likes. */
function fakeFeed() {
  const listeners: Parameters<JobFeed["subscribe"]>[0][] = [];
  let release: (rows: Awaited<ReturnType<JobFeed["load"]>>) => void = () => undefined;
  let fail: (e: Error) => void = () => undefined;
  const feed: JobFeed = {
    load: () =>
      new Promise((resolve, reject) => {
        release = resolve;
        fail = reject;
      }),
    subscribe(on) {
      listeners.push(on);
      return () => listeners.splice(listeners.indexOf(on), 1);
    },
  };
  let state: LiveState = EMPTY;
  const stop = watch(feed, (next) => {
    state = next(state);
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    listeners,
    stop,
    state: () => state,
    push: (changed: LiveJob) => listeners.forEach((on) => on.job(changed)),
    release: async (rows: Awaited<ReturnType<JobFeed["load"]>>) => {
      release(rows);
      await settle();
    },
    fail: async () => {
      fail(new Error("fetch failed: ECONNREFUSED"));
      await settle();
    },
  };
}

describe("watch", () => {
  it("keeps a change that arrives before the first read", async () => {
    const f = fakeFeed();
    f.push({ ...job, state: "PAUSED", updated_at: "2026-11-21T10:00:05+00:00" });
    await f.release({ sites: [], servers: [server], jobs: [job] });
    expect(f.state().status).toBe("live");
    expect(f.state().jobs.get("j304")?.state).toBe("PAUSED");
  });

  it("never lets an older copy undo a newer change", async () => {
    const f = fakeFeed();
    await f.release({ sites: [], servers: [server], jobs: [job] });
    f.push({ ...job, state: "PAUSED", updated_at: "2026-11-21T10:00:05+00:00" });
    f.push({ ...job, state: "RUNNING", updated_at: "2026-11-21T09:59:00+00:00" });
    expect(f.state().jobs.get("j304")?.state).toBe("PAUSED");
  });

  it("adds a job it has not seen, such as one just submitted", async () => {
    const f = fakeFeed();
    await f.release({ sites: [], servers: [], jobs: [] });
    f.push({ ...job, id: "new", state: "QUEUED", server_id: null });
    expect(f.state().jobs.get("new")?.state).toBe("QUEUED");
  });

  it("stops listening and ignores a read that comes back late", async () => {
    const f = fakeFeed();
    f.stop();
    expect(f.listeners).toHaveLength(0);
    await f.release({ sites: [], servers: [server], jobs: [job] });
    expect(f.state().status).toBe("loading");
  });

  it("marks the feed as failed when the read fails", async () => {
    const f = fakeFeed();
    await f.fail();
    expect(f.state().status).toBe("error");
  });
});

describe("heatKwh", () => {
  it("is run time times power times heat recovery", () => {
    expect(heatKwh(job, server)).toBeCloseTo(0.8);
  });

  it("is unknown for a job with no server", () => {
    expect(heatKwh(job, undefined)).toBeUndefined();
  });
});
