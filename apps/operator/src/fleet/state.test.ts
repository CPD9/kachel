import { describe, expect, it } from "vitest";
import { fleetMonth, MONTHS } from "./months";
import { ATTENTION_BELOW, covered, needsAttention, stateOf } from "./state";

describe("needs attention", () => {
  it("lists the houses whose servers covered too little of their heat, least first", () => {
    const m = fleetMonth(MONTHS, { month: 10, offset: 0 });
    const list = needsAttention(m, "November");
    expect(list.length).toBe(m.houses.filter((h) => covered(h) < ATTENTION_BELOW).length);
    const shares = list.map((a) => covered(a.row));
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
    for (const a of list) expect(stateOf(a.row)).toBe("attention");
    expect(list[0]?.what).toMatch(/^Servers covered \d+ % of its heat in November/);
  });

  it("is longer in a colder what-if", () => {
    const cold = needsAttention(fleetMonth(MONTHS, { month: 10, offset: -6 }), "November");
    const as = needsAttention(fleetMonth(MONTHS, { month: 10, offset: 0 }), "November");
    expect(cold.length).toBeGreaterThan(as.length);
  });
});
