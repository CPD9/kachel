import { describe, expect, it } from "vitest";
import { monthlyHeat } from "./months";

// Degree days for a Basel roof, January to December, as Sonnendach gives them.
const BASEL_DD = [545, 488, 393, 187, 71, 5, 0, 0, 36, 166, 394, 535];

describe("monthly heat", () => {
  it("adds up to the yearly figure", () => {
    const months = monthlyHeat(314_659, 71_408, BASEL_DD);
    expect(months).toHaveLength(12);
    expect(months.reduce((a, b) => a + b, 0)).toBeCloseTo(314_659 + 71_408, 6);
  });

  it("puts most heat in winter and only hot water in July", () => {
    const months = monthlyHeat(10_000, 3_650, BASEL_DD);
    expect(months[0]).toBeGreaterThan(months[5] ?? Infinity);
    expect(months[6]).toBeCloseTo((3_650 * 31) / 365);
  });

  it("spreads heating by days when there are no degree days", () => {
    const months = monthlyHeat(3_650, 0, []);
    expect(months[1]).toBeCloseTo(280);
    expect(months.reduce((a, b) => a + b, 0)).toBeCloseTo(3_650);
  });
});
