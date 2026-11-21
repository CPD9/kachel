import type { JobFeed, LiveJob, LiveServer, LiveSite } from "@kachel/db";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { JobTable } from "./JobTable";

const site: LiveSite = { id: "h1", name: "Reference house", city: "Basel" };
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
  active_cpu_s: 1800,
  created_at: "2026-11-21T09:00:00+00:00",
  updated_at: "2026-11-21T10:00:00+00:00",
};
const queued: LiveJob = {
  ...job,
  id: "j305",
  label: "Evening chat session",
  kind: "interactive",
  state: "QUEUED",
  site_id: null,
  server_id: null,
  active_cpu_s: 0,
  created_at: "2026-11-21T09:30:00+00:00",
};

function fakeFeed(jobs: LiveJob[]) {
  const listeners: Parameters<JobFeed["subscribe"]>[0][] = [];
  const feed: JobFeed = {
    load: () => Promise.resolve({ sites: [site], servers: [server], jobs }),
    subscribe(on) {
      listeners.push(on);
      return () => listeners.splice(listeners.indexOf(on), 1);
    },
  };
  const push = (changed: LiveJob) => act(() => listeners.forEach((on) => on.job(changed)));
  return { feed, push };
}

const row = (label: string) => screen.getByText(label).closest("tr") as HTMLElement;

afterEach(cleanup);

describe("JobTable", () => {
  it("shows each job's state, home and heat delivered", async () => {
    const { feed } = fakeFeed([job, queued]);
    render(<JobTable feed={feed} />);
    await screen.findByText("Embeddings backlog, part 3");
    const running = row("Embeddings backlog, part 3");
    expect(within(running).getByText("Running").dataset["state"]).toBe("RUNNING");
    expect(within(running).getByText("Reference house, Basel · Server 4")).toBeTruthy();
    expect(within(running).getByText("0.40 kWh")).toBeTruthy();

    const waiting = row("Evening chat session");
    expect(within(waiting).getByText("Queued")).toBeTruthy();
    expect(within(waiting).getByText("Not placed yet")).toBeTruthy();
  });

  it("lists the newest job first", async () => {
    const { feed } = fakeFeed([job, queued]);
    render(<JobTable feed={feed} />);
    await screen.findByText("Evening chat session");
    const labels = screen.getAllByRole("row").slice(1);
    expect(labels[0]?.textContent).toMatch(/Evening chat session/);
  });

  it("orders jobs created together by label", async () => {
    const together = { ...queued, id: "j303", label: "Batch A", created_at: queued.created_at };
    const { feed } = fakeFeed([queued, together]);
    render(<JobTable feed={feed} />);
    await screen.findByText("Batch A");
    const labels = screen.getAllByRole("row").slice(1);
    expect(labels.map((r) => r.querySelector("td")?.textContent)).toEqual([
      "Batch A",
      "Evening chat session",
    ]);
  });

  it("updates a job's pill as it pauses and resumes, without a reload", async () => {
    const { feed, push } = fakeFeed([job]);
    render(<JobTable feed={feed} />);
    await screen.findByText("Embeddings backlog, part 3");
    await push({ ...job, state: "PAUSED", updated_at: "2026-11-21T10:00:05+00:00" });
    expect(screen.getByText("Paused: no heat sink")).toBeTruthy();
    await push({ ...job, state: "RUNNING", updated_at: "2026-11-21T10:00:09+00:00" });
    expect(screen.getByText("Running")).toBeTruthy();
  });

  it("says plainly when the database cannot be reached", async () => {
    const feed: JobFeed = {
      load: () => Promise.reject(new Error("fetch failed: ECONNREFUSED")),
      subscribe: () => () => undefined,
    };
    render(<JobTable feed={feed} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/cannot be reached/);
    expect(alert.textContent).not.toMatch(/ECONNREFUSED/);
  });
});
