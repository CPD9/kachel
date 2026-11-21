import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { JobFeed, LiveJob, LiveServer } from "./feed";
import { LiveJobs } from "./LiveJobs";

const server: LiveServer = {
  id: "s4",
  slot: 4,
  name: "Server 4",
  state: "RUNNING",
  updated_at: "2026-11-21T10:00:00+00:00",
};
const job: LiveJob = {
  id: "j304",
  label: "Embeddings backlog, part 3",
  state: "RUNNING",
  server_id: "s4",
  updated_at: "2026-11-21T10:00:00+00:00",
};

/** A feed the test drives by hand, as the agent would through Supabase. */
function fakeFeed(first: { servers: LiveServer[]; jobs: LiveJob[] }) {
  const listeners: Parameters<JobFeed["subscribe"]>[0][] = [];
  const feed: JobFeed = {
    load: () => Promise.resolve(first),
    subscribe(on) {
      listeners.push(on);
      return () => listeners.splice(listeners.indexOf(on), 1);
    },
  };
  const push = (changed: LiveJob) => act(() => listeners.forEach((on) => on.job(changed)));
  return { feed, push, listeners };
}

const pill = () => screen.getByText(/Running|Paused|Done/);

afterEach(cleanup);

describe("LiveJobs", () => {
  it("shows the job pause and resume as the changes arrive", async () => {
    const { feed, push } = fakeFeed({ servers: [server], jobs: [job] });
    render(<LiveJobs feed={feed} />);
    expect(await screen.findByText("Embeddings backlog, part 3")).toBeTruthy();
    expect(pill().dataset["state"]).toBe("RUNNING");

    await push({ ...job, state: "PAUSED", updated_at: "2026-11-21T10:00:05+00:00" });
    expect(pill().dataset["state"]).toBe("PAUSED");

    await push({ ...job, state: "RUNNING", updated_at: "2026-11-21T10:00:09+00:00" });
    expect(pill().dataset["state"]).toBe("RUNNING");

    await push({ ...job, state: "GONE", updated_at: "2026-11-21T10:00:12+00:00" });
    expect(pill().dataset["state"]).toBe("DONE");
  });

  it("never lets an older copy undo a newer change", async () => {
    const { feed, push } = fakeFeed({ servers: [server], jobs: [job] });
    render(<LiveJobs feed={feed} />);
    await screen.findByText("Embeddings backlog, part 3");
    await push({ ...job, state: "PAUSED", updated_at: "2026-11-21T10:00:05+00:00" });
    await push({ ...job, state: "RUNNING", updated_at: "2026-11-21T09:59:00+00:00" });
    expect(pill().dataset["state"]).toBe("PAUSED");
  });

  it("leaves queued jobs off and says what an empty server is doing", async () => {
    const queued = { ...job, state: "QUEUED" as const };
    const { feed } = fakeFeed({ servers: [{ ...server, state: "OFF" }], jobs: [queued] });
    render(<LiveJobs feed={feed} />);
    expect(await screen.findByText("Off")).toBeTruthy();
    expect(screen.queryByText("Embeddings backlog, part 3")).toBeNull();
  });

  it("stops listening when it leaves the page", async () => {
    const { feed, listeners } = fakeFeed({ servers: [server], jobs: [job] });
    const { unmount } = render(<LiveJobs feed={feed} />);
    await screen.findByText("Embeddings backlog, part 3");
    unmount();
    expect(listeners).toHaveLength(0);
  });

  it("says plainly when the database cannot be reached", async () => {
    const feed: JobFeed = {
      load: () => Promise.reject(new Error("fetch failed: ECONNREFUSED")),
      subscribe: () => () => undefined,
    };
    render(<LiveJobs feed={feed} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/cannot be reached/);
    expect(alert.textContent).not.toMatch(/ECONNREFUSED/);
  });
});
