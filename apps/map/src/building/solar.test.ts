import { describe, expect, it } from "vitest";
import { describeSolar, parseSolar, solarUrl } from "./solar";

describe("OSM solar", () => {
  it("counts photovoltaic and thermal installations", () => {
    // Shapes as Overpass returned them for Basel on 21 Nov 2026.
    const body = {
      elements: [
        { type: "node", tags: { "generator:source": "solar", "generator:method": "thermal" } },
        { type: "way", tags: { "generator:source": "solar", "generator:method": "photovoltaic" } },
        { type: "way", tags: { "generator:source": "solar" } },
      ],
    };
    expect(parseSolar(body)).toEqual({ photovoltaic: 1, thermal: 1, other: 1 });
  });

  it("gives nothing for a broken answer", () => {
    expect(parseSolar("<html>")).toBeNull();
  });

  it("says it in plain words", () => {
    expect(describeSolar({ photovoltaic: 2, thermal: 1, other: 0 })).toBe(
      "2 photovoltaic and 1 solar thermal",
    );
    expect(describeSolar({ photovoltaic: 0, thermal: 0, other: 0 })).toBe("none");
  });

  it("asks only around the building", () => {
    expect(decodeURIComponent(solarUrl(7.5754, 47.5608))).toContain("around:40,47.560800,7.575400");
  });
});
