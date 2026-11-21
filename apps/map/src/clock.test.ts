import { describe, expect, it } from "vitest";
import { beforeSunset, swissHour, swissTime } from "./clock";
import { sunElevationDeg } from "./sun";

describe("clock", () => {
  it("starts twenty minutes before sunset in Basel, with the sun still up", () => {
    const start = beforeSunset(new Date("2026-11-21T08:00:00Z"), 47.56, 7.59, 20);
    expect(swissTime(start)).toMatch(/^16:2\d$/);
    expect(sunElevationDeg(start, 47.56, 7.59)).toBeGreaterThan(0);
  });

  it("reads Swiss summer time in June", () => {
    expect(swissTime(new Date("2026-06-21T18:30:00Z"))).toBe("20:30");
    expect(swissHour(new Date("2026-06-21T18:30:00Z"))).toBeCloseTo(20.5);
  });
});
