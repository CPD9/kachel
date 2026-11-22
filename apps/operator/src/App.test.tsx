import type { AppAuth, JobFeed, LiveJob } from "@kachel/db";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { Dashboard } from "./fleet/Dashboard";
import type { OperatorSource } from "./live/live";

afterEach(cleanup);

const reading = (name: string) => {
  const el = document.querySelector(`[data-reading="${name}"] [data-value]`);
  if (el === null) throw new Error(`no reading ${name}`);
  return Number((el.textContent ?? "").replace(/\D/g, ""));
};

const signedIn: AppAuth = {
  current: () => Promise.resolve("operator@kachel.test"),
  onChange: () => () => undefined,
  signIn: () => Promise.resolve(true),
  signOut: () => Promise.resolve(),
};

const job = (id: string, buyer: string, state: LiveJob["state"]): LiveJob => ({
  id,
  buyer_id: buyer,
  label: id,
  kind: "batch",
  state,
  site_id: "s1",
  server_id: state === "QUEUED" ? null : "v1",
  server_hours: 2,
  deadline_at: null,
  active_cpu_s: 0,
  moved_offsite: false,
  created_at: "2026-11-21T10:00:00Z",
  updated_at: "2026-11-21T10:00:00Z",
});

const feed: JobFeed = {
  load: () =>
    Promise.resolve({
      sites: [{ id: "s1", name: "Synthetic house, Breite", city: "Basel" }],
      servers: [],
      jobs: [job("j1", "b1", "RUNNING"), job("j2", "b1", "QUEUED"), job("j3", "b2", "PAUSED")],
    }),
  subscribe: () => () => undefined,
};

const source: OperatorSource = {
  auth: signedIn,
  feed,
  buyers: () =>
    Promise.resolve([
      { id: "b1", name: "Game streaming", buys: "Gaming sessions", synthetic: true },
      { id: "b2", name: "AI research lab", buys: "Training", synthetic: true },
    ]),
  places: () =>
    Promise.resolve([
      {
        id: "s1",
        name: "Synthetic house, Breite",
        city: "Basel",
        latitude: 47.552,
        longitude: 7.612,
      },
    ]),
  local: true,
};

const signedOut: OperatorSource = {
  ...source,
  auth: { ...signedIn, current: () => Promise.resolve(null) },
};

describe("operator view", () => {
  it("shows the headline revenue, the month's figures and every home", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Operator view" })).toBeTruthy();
    expect(reading("Revenue this year")).toBeGreaterThan(0);
    expect(document.querySelectorAll("tbody tr[data-house]")).toHaveLength(100);
    expect(document.querySelectorAll("li[data-house-card]")).toHaveLength(100);
    expect(screen.getByRole("img", { name: /Basel and Bern/ })).toBeTruthy();
    // Without Supabase (a deployed build): the model shows, and the live part says what it needs
    expect(screen.getByText(/Live data needs the local stack/)).toBeTruthy();
    expect(screen.queryByText(/Sign in as the operator/)).toBeNull();
  });

  it("follows the month: less heat and revenue in July than in January", () => {
    render(<Dashboard startMonth={0} />);
    const [heat, revenue] = [reading("Heat delivered"), reading("Revenue today")];
    fireEvent.click(screen.getByRole("button", { name: "July" }));
    expect(screen.getByRole("button", { name: "July" }).getAttribute("aria-pressed")).toBe("true");
    expect(reading("Heat delivered")).toBeLessThan(heat);
    expect(reading("Revenue today")).toBeLessThan(revenue);
  });

  it("follows the temperature, and says when it shows a what-if", () => {
    render(<Dashboard startMonth={0} />);
    const [backup, year] = [reading("Backup"), reading("Revenue this year")];
    fireEvent.change(screen.getByRole("slider", { name: "Outdoor temperature" }), {
      target: { value: "4" },
    });
    expect(document.querySelector("[data-model]")?.textContent).toContain("+4 °C");
    expect(reading("Backup")).toBeLessThan(backup);
    expect(reading("Revenue this year")).toBeLessThan(year);
  });

  it("asks for the operator's sign-in before it shows buyers", async () => {
    render(<Dashboard startMonth={0} source={signedOut} />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText(/operator@kachel.test, password kachel-demo/)).toBeTruthy();
    expect(document.querySelector("[data-buyer]")).toBeNull();
  });

  it("lists every buyer with their jobs, and draws a line to each running or paused one", async () => {
    await act(async () => {
      render(<Dashboard startMonth={0} source={source} />);
    });
    expect(await screen.findByText(/1 running · 0 paused · 1 queued/)).toBeTruthy();
    expect(document.querySelectorAll("[data-buyer]")).toHaveLength(2);
    expect(document.querySelectorAll("path.flow")).toHaveLength(1);
    expect(document.querySelectorAll('path[stroke-dasharray="2 6"]')).toHaveLength(1);
  });
});
