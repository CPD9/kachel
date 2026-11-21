import { describe, expect, it } from "vitest";
import { nightFactor, sunElevationDeg, windowsLitShare } from "./sun";

const BASEL = { lat: 47.5596, lon: 7.5886 };

describe("sun elevation", () => {
  it("is high at noon on the June solstice in Basel", () => {
    // Solar noon in Basel is about 11:30 UTC; the sun stands near 90 − 47.56 + 23.44 = 65.9°.
    const e = sunElevationDeg(new Date("2026-06-21T11:30:00Z"), BASEL.lat, BASEL.lon);
    expect(e).toBeGreaterThan(65);
    expect(e).toBeLessThan(67);
  });

  it("is about 19° at noon on the December solstice", () => {
    const e = sunElevationDeg(new Date("2026-12-21T11:30:00Z"), BASEL.lat, BASEL.lon);
    expect(e).toBeGreaterThan(18);
    expect(e).toBeLessThan(20);
  });

  it("crosses the horizon near the published sunset on 21 November (16:46 CET)", () => {
    const before = sunElevationDeg(new Date("2026-11-21T15:30:00Z"), BASEL.lat, BASEL.lon);
    const after = sunElevationDeg(new Date("2026-11-21T16:00:00Z"), BASEL.lat, BASEL.lon);
    expect(before).toBeGreaterThan(0);
    expect(after).toBeLessThan(0);
  });

  it("is below the horizon at midnight", () => {
    expect(sunElevationDeg(new Date("2026-11-21T23:00:00Z"), BASEL.lat, BASEL.lon)).toBeLessThan(
      -30,
    );
  });
});

describe("night factor", () => {
  it("is 0 in daylight, 1 at night and in between at dusk", () => {
    expect(nightFactor(30)).toBe(0);
    expect(nightFactor(-10)).toBe(1);
    expect(nightFactor(-2)).toBeCloseTo(0.5);
  });
});

describe("windows lit", () => {
  it("peaks in the evening and drops after midnight", () => {
    expect(windowsLitShare(19)).toBeGreaterThan(windowsLitShare(3));
    expect(windowsLitShare(-5)).toBe(windowsLitShare(19));
  });
});
