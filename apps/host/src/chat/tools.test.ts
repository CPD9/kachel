import { describe, expect, it } from "vitest";
import { fakeData } from "./fixtures";
import { runTool, type ToolResult } from "./tools";

const value = (r: ToolResult | undefined, label: string) =>
  r?.facts.find((f) => f.label === label)?.value;

describe("chat tools", () => {
  it("reads the tank at the clock's hour and says it is a replay", async () => {
    const r = await runTool("heat_now", {}, fakeData());
    expect(value(r, "Heat stored in the tank")).toBe(31.2);
    expect(value(r, "Tank size")).toBe(35);
    expect(value(r, "Tank full")).toBe(89);
    expect(String(value(r, "Data"))).toMatch(/^Replay of 15 July 2025/);
    expect(r?.note).toMatch(/no water temperature/);
    expect(r?.facts.find((f) => f.label === "Heat stored in the tank")?.source).toBe(
      "heat_state at 14:00 on 15 July 2025: soc_kwh",
    );
  });

  it("adds up the shown day", async () => {
    const r = await runTool("heat_today", {}, fakeData());
    expect(value(r, "Server-hours")).toBe(2);
    expect(value(r, "Heat from the servers")).toBe(1.6);
    expect(value(r, "Servers' share of the heat")).toBe(100);
  });

  it("counts the day's money as the host screen does, and the year from kpis", async () => {
    const r = await runTool("money", {}, fakeData());
    // 2 server-hours × 0.5 CHF.
    expect(value(r, "15 July 2025: earned from computing")).toBe(1);
    // 2 × 1 kW × 0.277.
    expect(value(r, "15 July 2025: electricity for the servers")).toBe(0.55);
    expect(value(r, "Year: earned from computing")).toBe(15538);
    expect(value(r, "Year: left before hardware")).toBe(15538 - 8608 + 2753);
  });

  it("says why server 4 is paused, from job_runs", async () => {
    const r = await runTool("jobs", { server: 4 }, fakeData());
    expect(value(r, "Server 4")).toBe("PAUSED");
    expect(value(r, "Server 4: job")).toBe("Embeddings backlog, part 3 (PAUSED)");
    expect(value(r, "Server 4: why")).toBe("tank full / no heat sink: backlog paused");
    expect(r?.facts.some((f) => f.label.startsWith("Server 1"))).toBe(false);
  });

  it("says so when there is no such server", async () => {
    const r = await runTool("jobs", { server: 9 }, fakeData());
    expect(r?.facts).toEqual([]);
    expect(r?.note).toBe("This house has no server 9.");
  });

  it("gives the solar saving and payback from packages/economics with its tariff", async () => {
    const r = await runTool("solar", {}, fakeData());
    // The reference house pays IWB's 2027 household price (packages/economics).
    expect(value(r, "Electricity price")).toBe(0.3342);
    expect(r?.facts[0]?.source).toMatch(/^IWB Basel 2027, households \(H4\): ElCom/);
    expect(value(r, "PV saves the servers")).toBe(2766);
    expect(value(r, "PV pays back in")).toBe(7);
    expect(value(r, "PV and battery pay back in")).toBe(9.7);
    expect(r?.facts.find((f) => f.label === "PV saves the servers")?.source).toMatch(
      /docs\/economics/,
    );
  });

  it("returns nothing and says why when the house has no hours", async () => {
    const data = fakeData({
      house: {
        load: () => Promise.resolve({ site: null, hours: [], year: null, assumptions: [] }),
        subscribe: () => () => undefined,
      },
    });
    const r = await runTool("heat_now", {}, data);
    expect(r?.facts).toEqual([]);
    expect(r?.note).toBe("No house is linked to this account yet.");
  });

  it("turns a failed read into a note, and refuses tools it does not have", async () => {
    const data = fakeData({
      house: { load: () => Promise.reject(new Error("db down")), subscribe: () => () => undefined },
    });
    const r = await runTool("heat_now", {}, data);
    expect(r?.note).toBe("The house's data could not be read right now.");
    expect(await runTool("rerun_year", {}, data)).toBeUndefined();
  });
});
