import { JOB_TYPES } from "@kachel/economics/model";
import { describe, expect, it } from "vitest";
import {
  mismatch,
  needsFor,
  OFFERS,
  ONE_TIME_PREMIUM,
  quote,
  quotes,
  type Workload,
  WORKLOADS,
} from "./market";

function house(id: string) {
  const o = OFFERS.find((x) => x.id === id);
  if (!o) throw new Error(`No demo house ${id}`);
  return o;
}

describe("market", () => {
  it("has at least one house for every kind of workload", () => {
    for (const w of Object.keys(WORKLOADS) as Workload[]) {
      const fits = quotes(needsFor(w, true), "match").filter((q) => !q.miss);
      expect(fits.length, w).toBeGreaterThan(0);
    }
  });

  it("says why a house doesn't fit", () => {
    expect(mismatch(house("bruderholz"), needsFor("train", false))).toMatch(/GPU/);
    expect(mismatch(house("breite"), needsFor("gaming", false))).toBe("CPUs only");
    expect(mismatch(house("breite"), needsFor("science", false))).toBeNull();
  });

  it("is cheaper with heat-flex, and cheaper than the cloud", () => {
    const plain = quote(house("byfang"), needsFor("render", false));
    const flex = quote(house("byfang"), needsFor("render", true));
    expect(flex.total).toBeLessThan(plain.total);
    expect(plain.total).toBeLessThan(plain.cloud);
  });

  it("bills a one-time job once, for its hours, at the on-demand rate", () => {
    const monthly = quote(house("byfang"), needsFor("render", false));
    const job = needsFor("render", false, true);
    const once = quote(house("byfang"), job);
    expect(job.once).toBe(true);
    expect(job.hours).toBe(WORKLOADS.render.job);
    expect(once.perHour).toBeCloseTo(monthly.perHour * (1 + ONE_TIME_PREMIUM));
    expect(once.total).toBeCloseTo(once.perHour * job.hours);
    expect(once.total).toBeLessThan(once.cloud);
  });

  it("lists the houses that fit first, in every sort", () => {
    for (const sort of ["match", "price", "heat"] as const) {
      const list = quotes(needsFor("gaming", true), sort);
      const firstMiss = list.findIndex((q) => q.miss);
      if (firstMiss >= 0) expect(list.slice(firstMiss).every((q) => q.miss)).toBe(true);
    }
  });
});

describe("image and video tagging", () => {
  it("shows our measured speed, not the cited MLPerf one", () => {
    const t = JOB_TYPES.image_tagging;
    expect(WORKLOADS.tagging.note).toBe(
      `≈ ${t.measured_images_per_server_hour.toLocaleString("en-GB")} images a server-hour, measured`,
    );
    expect(WORKLOADS.tagging.note).not.toContain(t.images_per_server_hour.toLocaleString("en-GB"));
  });
});
