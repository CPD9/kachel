import { beforeEach, describe, expect, it, vi } from "vitest";
import { heatEstimate, formatEnergy } from "./estimate";
import { clearCache, lookUp, parseRegister, parseRoofs, type Fetch } from "./geoadmin";

// Shapes as api3.geo.admin.ch returned them on 21 Nov 2026 for Missionsstrasse 55, Basel.
const GWR = {
  egid: "441428",
  strname_deinr: "Missionsstrasse 55",
  gbauj: 1874,
  gbaup: 8011,
  gebf: 668,
  gastw: 4,
  ganzwhg: 2,
  genh1: 7582,
  genw1: 7582,
  gexpdat: "19.11.2026",
};
const ROOF = {
  building_id: 1599044,
  bedarf_heizung: 314659,
  bedarf_warmwasser: 71408,
  stromertrag: 5370,
  monate: [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 12, 11],
  heizgradtage: [166, 36, 0, 0, 5, 71, 187, 393, 488, 545, 535, 394],
};
const HECTARE = { needtotal: 4561.6, percentremoteheat: 81.8 };

function fakeFetch(): Fetch & { calls: string[] } {
  const calls: string[] = [];
  const f = vi.fn(async (url: string) => {
    calls.push(url);
    const body = url.includes("/find?")
      ? { results: [{ attributes: GWR }] }
      : url.includes("solarenergie")
        ? { results: [{ attributes: ROOF }, { attributes: { ...ROOF, stromertrag: 7898 } }] }
        : { results: [{ attributes: HECTARE }] };
    return { ok: true, json: async () => body };
  });
  return Object.assign(f, { calls });
}

beforeEach(clearCache);

describe("building register", () => {
  it("reads the heating, the area and the year", () => {
    const r = parseRegister(GWR);
    expect(r?.address).toBe("Missionsstrasse 55");
    expect(r?.heating).toBe("district heating (low temperature)");
    expect(r?.heatingKind).toBe("district");
    expect(r?.heatedAreaM2).toBe(668);
    expect(r?.built).toBe("1874");
  });

  it("falls back to the build period when the year is missing", () => {
    expect(parseRegister({ ...GWR, gbauj: null })?.built).toBe("before 1919");
  });
});

describe("Sonnendach", () => {
  it("orders the degree days January to December and adds the roofs' solar yield", () => {
    const r = parseRoofs([ROOF, { ...ROOF, stromertrag: 7898 }]);
    expect(r?.degreeDays).toEqual([545, 488, 393, 187, 71, 5, 0, 0, 36, 166, 394, 535]);
    expect(r?.solarKwh).toBe(13268);
    expect(r?.heatingKwh).toBe(314659);
  });

  it("gives nothing when no roof carries a demand", () => {
    expect(parseRoofs([])).toBeNull();
  });
});

describe("look-up", () => {
  it("asks each layer once per building and caches the answer", async () => {
    const f = fakeFetch();
    const picked = { egid: 441428, lon: 7.5754, lat: 47.5608 };
    const facts = await lookUp(picked, f);
    await lookUp(picked, f);
    expect(f.calls).toHaveLength(3);
    expect(facts.register?.egid).toBe(441428);
    expect(facts.hectare?.totalMwh).toBe(4561.6);
  });

  it("turns a failed request into a missing piece, not an error", async () => {
    const f: Fetch = async () => {
      throw new Error("offline");
    };
    const facts = await lookUp({ egid: 1, lon: 7.5, lat: 47.5 }, f);
    expect(facts).toEqual({ register: null, roof: null, hectare: null });
  });
});

describe("heat estimate", () => {
  it("adds heating and hot water and divides by the heat pump's COP", () => {
    const e = heatEstimate(10_000, 2_000, "heat pump", 120);
    expect(e.heatKwh).toBe(12_000);
    expect(e.energyKwh).toBeCloseTo(12_000 / 3.4);
    expect(e.perSquareMetre).toBe(100);
  });

  it("leaves energy use open when the heating is not known", () => {
    expect(heatEstimate(1, 1, "unknown", null).energyKwh).toBeNull();
  });

  it("rounds to three figures", () => {
    expect(formatEnergy(12_345)).toBe("12.3 MWh");
    expect(formatEnergy(386_067)).toBe("386 MWh");
    expect(formatEnergy(8_765)).toBe("8,770 kWh");
  });
});
