import type { AppAuth, DecisionFeed, JobFeed, LiveDecision, LiveJob } from "@kachel/db";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import type { OperatorSource } from "./live/live";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const at = (route: string) => {
  window.location.hash = route;
};

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

const decision: LiveDecision = {
  hash: "91156f8a4342" + "3".repeat(52),
  prev_hash: "5ec7b4868fd0" + "1".repeat(52),
  seq: 25,
  site_id: "00000000-0000-4000-8000-000000000100",
  time: "2025-07-15T01:00:00+02:00",
  temp_c: 19.8,
  demand_kwh: 0.5,
  soc_kwh: 34.3,
  tank_kwh: 35,
  interactive: 0,
  batch: 0,
  opportunistic: 1,
  reason: "heat needed",
  run: ["00000000-0000-4000-8000-000000000304"],
  placed: 0,
  written_at: "2026-11-22T01:00:00Z",
};
const decisions: DecisionFeed = {
  load: () => Promise.resolve([decision]),
  subscribe: () => () => undefined,
};

const signedOut: OperatorSource = {
  ...source,
  auth: { ...signedIn, current: () => Promise.resolve(null) },
};

describe("operator console", () => {
  it("opens on Today: one headline, the houses that need you, and the two cities", () => {
    render(<App startMonth={10} />);
    const headline = document.querySelector("[data-headline]")?.textContent ?? "";
    const marked = document.querySelectorAll("tr[data-attention]").length;
    expect(marked).toBeGreaterThan(0);
    expect(headline).toMatch(
      new RegExp(`${100 - marked} homes warm on server heat, ${marked} need`),
    );
    expect(document.querySelectorAll("[data-marked]")).toHaveLength(marked);
    expect(screen.getByRole("img", { name: /Basel and Bern/ })).toBeTruthy();
    expect(reading("Balance")).toBeGreaterThan(0);
    expect(document.querySelector("[data-model]")?.textContent).toBe(
      "Model: 2025 weather, synthetic homes",
    );
    // Five places in the bar, no more
    const bar = screen.getByRole("navigation", { name: "Console" });
    expect(bar.querySelectorAll("a")).toHaveLength(5);
    // Without Supabase nothing asks for a sign-in
    expect(screen.queryByText(/Sign in as the operator/)).toBeNull();
  });

  it("marks on the map only the houses the list shows, even in a cold what-if", () => {
    at("#/billing");
    render(<App startMonth={10} />);
    fireEvent.change(screen.getByRole("slider", { name: "Outdoor temperature" }), {
      target: { value: "-6" },
    });
    act(() => {
      window.location.hash = "#/today";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    const rows = document.querySelectorAll("tr[data-attention]").length;
    expect(screen.getByText(/more in/)).toBeTruthy();
    expect(document.querySelectorAll("[data-marked]")).toHaveLength(rows);
  });

  it("says nothing needs you in a month when every home's servers keep up", () => {
    render(<App startMonth={6} />);
    expect(document.querySelector("[data-headline]")?.textContent).toMatch(/Nothing needs you/);
    expect(document.querySelectorAll("tr[data-attention]")).toHaveLength(0);
  });

  it("lists every building and filters them by state and name", () => {
    at("#/buildings");
    render(<App startMonth={10} />);
    expect(document.querySelectorAll("tr[data-building]")).toHaveLength(100);
    expect(document.querySelectorAll("li[data-building-card]")).toHaveLength(100);
    fireEvent.change(screen.getByRole("combobox", { name: "State" }), {
      target: { value: "attention" },
    });
    const few = document.querySelectorAll("tr[data-building]").length;
    expect(few).toBeGreaterThan(0);
    expect(few).toBeLessThan(100);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search" }), {
      target: { value: "nowhere" },
    });
    expect(screen.getByText(/No building matches/)).toBeTruthy();
  });

  it("settles the month and follows the month picker: less in July than in January", () => {
    at("#/billing");
    render(<App startMonth={0} />);
    expect(screen.getByRole("heading", { name: "Settlement for January" })).toBeTruthy();
    const [invoiced, margin] = [reading("Invoiced"), reading("Margin")];
    expect(document.querySelector("[data-reconcile]")?.textContent).toContain(
      "margin before hardware",
    );
    fireEvent.click(screen.getByRole("button", { name: "July" }));
    expect(screen.getByRole("button", { name: "July" }).getAttribute("aria-pressed")).toBe("true");
    expect(reading("Invoiced")).toBeLessThan(invoiced);
    expect(reading("Margin")).toBeLessThan(margin);
  });

  it("follows the temperature in the year's revenue, and says when it shows a what-if", () => {
    at("#/billing/year");
    render(<App startMonth={0} />);
    const year = reading("Revenue this year");
    expect(year).toBeGreaterThan(0);
    fireEvent.change(screen.getByRole("slider", { name: "Outdoor temperature" }), {
      target: { value: "4" },
    });
    expect(document.querySelector("[data-model]")?.textContent).toContain("+4 °C");
    expect(reading("Revenue this year")).toBeLessThan(year);
  });

  it("prices image tagging from our measured speed, with no placeholders", () => {
    at("#/quotes");
    render(<App startMonth={10} />);
    expect(document.querySelector('[data-reading="Unit price"]')?.textContent).toBe("CHF 1.60");
    expect(document.querySelector("[data-basis]")?.textContent).toBe("Speed measured on our GPU.");
    expect(document.body.textContent).not.toMatch(/\[(PRICE|N|COST)\]/);
    // The list: synthetic buyers, labelled, priced by the same model; never a real rail company.
    expect(document.querySelectorAll("[data-quote]").length).toBeGreaterThan(2);
    expect(document.querySelector("[data-quote=q1]")?.textContent).toMatch(
      /Rail operator \(synthetic\).*CHF 1\.60/,
    );
    expect(document.body.textContent).not.toMatch(/SBB/);
  });

  it("without Supabase, Jobs says what the live part needs", () => {
    at("#/jobs");
    render(<App />);
    expect(screen.getByText(/Live data needs the local stack/)).toBeTruthy();
    // The table is still full: the seed's synthetic jobs, said not to be live.
    expect(document.querySelector("[data-jobs-caption]")?.textContent).toMatch(
      /synthetic rows from the seed, not live/,
    );
    expect(document.querySelectorAll("tr[data-job]").length).toBe(23);
    expect(document.querySelector("tr[data-state=RUNNING]")?.textContent).toMatch(/kWh/);
  });

  it("asks for the operator's sign-in before it shows buyers", async () => {
    at("#/jobs");
    render(<App startMonth={0} source={signedOut} />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText(/operator@kachel.test, password kachel-demo/)).toBeTruthy();
    expect(document.querySelector("[data-buyer]")).toBeNull();
  });

  it("lists every buyer with their jobs, and draws a line to each running or paused one", async () => {
    at("#/jobs");
    await act(async () => {
      render(<App startMonth={0} source={source} />);
    });
    expect(await screen.findByText(/1 running · 0 paused · 1 queued/)).toBeTruthy();
    expect(document.querySelectorAll("[data-buyer]")).toHaveLength(2);
    // Signed in, the table holds the live rows, not the seed's.
    expect(document.querySelector("[data-jobs-caption]")?.textContent).toMatch(
      /live from Supabase/,
    );
    expect(document.querySelectorAll("tr[data-job]")).toHaveLength(3);
    await act(async () => {
      window.location.hash = "#/today";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.querySelectorAll("path.flow")).toHaveLength(1);
    expect(document.querySelectorAll('path[stroke-dasharray="2 6"]')).toHaveLength(1);
  });

  it("shows the scheduler's newest decision with its hash once signed in", async () => {
    at("#/jobs");
    await act(async () => {
      render(<App startMonth={0} source={{ ...source, decisions }} />);
    });
    expect(await screen.findByRole("heading", { name: /Why this decision/ })).toBeTruthy();
    expect(screen.getByText("Backlog runs on 1 server")).toBeTruthy();
    expect(screen.getByText(decision.hash)).toBeTruthy();
  });

  it("keeps the decisions to the signed-in operator", async () => {
    at("#/jobs");
    render(<App startMonth={0} source={{ ...signedOut, decisions }} />);
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /Why this decision/ })).toBeNull();
  });
});
