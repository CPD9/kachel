import { describe, expect, it, vi } from "vitest";
import { fakeData } from "./fixtures";
import { runTool } from "./tools";

// An economics run that left the roof's payback out.
vi.mock("@kachel/economics", async (real) => {
  const m = await real<typeof import("@kachel/economics")>();
  const byPrice = m.SOLAR.byPrice.map((p) => ({
    ...p,
    setups: { ...p.setups, pv: { ...p.setups.pv, paybackYearsMid: null } },
  }));
  return { ...m, SOLAR: { ...m.SOLAR, byPrice } };
});

describe("solar tool", () => {
  it("leaves out a figure the economics run does not have, and says so", async () => {
    const r = await runTool("solar", {}, fakeData());
    expect(r?.facts.some((f) => f.label === "PV pays back in")).toBe(false);
    expect(r?.facts.find((f) => f.label === "PV saves the servers")?.value).toBe(2766);
    expect(r?.note).toMatch(/Not in the economics run: PV pays back in\./);
  });
});
