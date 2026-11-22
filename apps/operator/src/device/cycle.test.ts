import { describe, expect, it } from "vitest";
import { carnotBound, EXAMPLE, PIPES, STEPS } from "./cycle";

describe("the device concept", () => {
  it("bounds the worked example by Carnot, in kelvin: about 15.6% at 80 °C and 25 °C", () => {
    expect(carnotBound(EXAMPLE.hotC, EXAMPLE.coldC)).toBeCloseTo(1 - 298.15 / 353.15, 10);
    expect(carnotBound(EXAMPLE.hotC, EXAMPLE.coldC)).toBeCloseTo(0.1557, 3);
    expect(carnotBound(40, 40)).toBe(0);
  });

  it("starts every running pipe at a step that exists", () => {
    for (const p of Object.values(PIPES))
      if (p.step !== null) expect(p.step).toBeLessThan(STEPS.length);
  });

  it("never says the servers run on their own electricity", () => {
    const words = STEPS.map((s) => `${s.title} ${s.text}`).join(" ");
    expect(words).not.toMatch(/self-sustain|own electricity|off.grid/i);
    expect(words).toMatch(/recovers part of the summer heat as electricity/);
  });
});
