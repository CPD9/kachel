import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HouseFeed } from "@kachel/db";
import { fakeHouse, janHour, julHour } from "./fixtures";
import { House } from "./House";

const twoPm = () => new Date("2026-11-21T14:30:00+01:00");
const day = (make: typeof janHour) => Array.from({ length: 24 }, (_, h) => make(h));

/** The value under a reading's label. */
const reading = (label: string) =>
  document.querySelector(`[data-reading="${label}"]`)?.textContent ?? "";

afterEach(cleanup);

describe("House", () => {
  it("shows the house at the clock's hour, saying it is a replay", async () => {
    const { feed } = fakeHouse([
      ...day(janHour),
      ...day(julHour),
      janHour(14, { temp_c: 2.0, demand_kwh: 7.53, backup_kwh: 2.73, soc_kwh: 7 }),
    ]);
    render(<House feed={feed} now={twoPm} />);
    expect(await screen.findByText(/Replay of 13 January 2025/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /The scheduler's day/ }).textContent).toMatch(
      /Replay of 13 Jan 2025/,
    );
    expect(reading("Outdoor")).toMatch(/^2\.0/);
    expect(reading("Demand")).toMatch(/^7\.5/);
    expect(reading("Servers")).toMatch(/^4\.8/);
    expect(reading("Backup")).toMatch(/^2\.7/);
    expect(
      screen.getByRole("meter", { name: "Heat in the tank" }).getAttribute("aria-valuenow"),
    ).toBe("7");
  });

  it("gives every number its source", async () => {
    const { feed } = fakeHouse(day(janHour));
    render(<House feed={feed} now={twoPm} />);
    await screen.findByText(/Replay of 13 January/);
    const notes = screen.getAllByRole("tooltip", { hidden: true }).map((n) => n.textContent);
    expect(notes.some((n) => n?.includes("heat_state.temp_c"))).toBe(true);
    expect(notes.some((n) => n?.includes("kpis.computing_income_chf"))).toBe(true);
    expect(notes.some((n) => n?.includes("prices.compute_chf_per_server_hour = 0.5"))).toBe(true);
  });

  it("shows the day's and the year's money", async () => {
    const { feed } = fakeHouse(day(janHour));
    render(<House feed={feed} now={twoPm} />);
    const money = within(await screen.findByRole("region", { name: "The money" }));
    expect(money.getByText(/CHF 72\.00/)).toBeTruthy();
    expect(money.getByText(/CHF 15,538/)).toBeTruthy();
    expect(money.getByText(/CHF 9,683/)).toBeTruthy();
  });

  it("updates when the scheduler writes the hour again", async () => {
    const { feed, push } = fakeHouse(day(janHour));
    render(<House feed={feed} now={twoPm} />);
    await screen.findByText(/Replay of 13 January/);
    expect(reading("Backup")).toMatch(/^5\.0/);
    act(() => push(janHour(14, { backup_kwh: 1.2 })));
    expect(reading("Backup")).toMatch(/^1\.2/);
  });

  it("calls today live once its hours arrive", async () => {
    const { feed, push } = fakeHouse(day(janHour));
    render(<House feed={feed} now={twoPm} />);
    await screen.findByText(/Replay of 13 January/);
    act(() => push(janHour(14, { time: "2026-11-21T14:00:00+01:00", heat_used: 3.2 })));
    expect(screen.getByText(/Live: today/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Your house now/ })).toBeTruthy();
    expect(document.querySelector("[data-replay]")).toBeNull();
    expect(reading("Servers")).toMatch(/^3\.2/);
  });

  it("says plainly when the house cannot be read", async () => {
    const feed: HouseFeed = {
      load: () => Promise.reject(new Error("fetch failed: ECONNREFUSED")),
      subscribe: () => () => undefined,
    };
    render(<House feed={feed} now={twoPm} />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/cannot be read/);
    expect(alert.textContent).not.toMatch(/ECONNREFUSED/);
  });
});
