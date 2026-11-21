import { beforeEach, describe, expect, it, vi } from "vitest";
import { heatEstimate, formatEnergy } from "./estimate";
import { clearCache, locate, lookUp, parseRegister, parseRoofs, type Fetch } from "./geoadmin";

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
      : url.includes("overpass")
        ? {
            elements: [
              { tags: { "generator:source": "solar", "generator:method": "photovoltaic" } },
            ],
          }
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
    expect(r?.period).toBe("before_1919");
  });

  it("reads the municipality, whose BFS number picks the electricity price", () => {
    const r = parseRegister({ ...GWR, ggdenr: 2701, ggdename: "Basel" });
    expect(r?.municipality).toEqual({ bfs: 2701, name: "Basel" });
    expect(parseRegister({ ...GWR, ggdenr: null })?.municipality).toBeNull();
  });

  it("tells a house from flats by the building class, else by the dwellings", () => {
    expect(parseRegister({ ...GWR, gklas: 1110 })?.kind).toBe("single");
    expect(parseRegister({ ...GWR, gklas: 1122 })?.kind).toBe("multi");
    expect(parseRegister({ ...GWR, gklas: null, ganzwhg: 2 })?.kind).toBe("single");
    expect(parseRegister({ ...GWR, gklas: null, ganzwhg: 8 })?.kind).toBe("multi");
    expect(parseRegister({ ...GWR, gklas: 1220 })?.kind).toBe("office");
    expect(parseRegister({ ...GWR, gklas: 1242 })?.kind).toBeNull(); // a garage
    expect(parseRegister({ ...GWR, gklas: null, ganzwhg: null })?.kind).toBeNull();
  });

  it("falls back to the build period when the year is missing", () => {
    expect(parseRegister({ ...GWR, gbauj: null })?.built).toBe("before 1919");
    expect(parseRegister({ ...GWR, gbauj: null, gbaup: 8014 })?.period).toBe("1961_1970");
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
    // GWR, roof, hectare, the roof's faces (for the building group) and Overpass.
    expect(f.calls).toHaveLength(5);
    expect(facts.osmSolar?.photovoltaic).toBe(1);
    expect(facts.register?.egid).toBe(441428);
    expect(facts.hectare?.totalMwh).toBe(4561.6);
  });

  it("finds the GWR buildings under the same Sonnendach roof", async () => {
    const square = [
      [7.575, 47.56],
      [7.576, 47.56],
      [7.576, 47.561],
      [7.575, 47.561],
      [7.575, 47.56],
    ];
    const f: Fetch = async (url) => {
      const body = url.includes("searchField=building_id")
        ? { results: [{ geometry: { type: "Polygon", coordinates: [square] } }] }
        : url.includes("esriGeometryEnvelope")
          ? {
              results: [
                {
                  geometry: { coordinates: [7.5752, 47.5602] },
                  properties: { egid: "441428", gebf: 668 },
                },
                {
                  geometry: { coordinates: [7.5758, 47.5608] },
                  properties: { egid: "9", gebf: 1000 },
                },
                {
                  geometry: { coordinates: [7.58, 47.5608] },
                  properties: { egid: "10", gebf: 5000 },
                },
              ],
            }
          : url.includes("/find?")
            ? { results: [{ attributes: GWR }] }
            : url.includes("overpass")
              ? { elements: [] }
              : url.includes("solarenergie")
                ? { results: [{ attributes: ROOF }] }
                : { results: [{ attributes: HECTARE }] };
      return { ok: true, json: async () => body };
    };
    const facts = await lookUp({ egid: 441428, lon: 7.5754, lat: 47.5608 }, f);
    expect(facts.group).toEqual({ egids: [441428, 9], floorM2: 1668 });
  });

  it("turns a failed request into a missing piece, not an error", async () => {
    const f: Fetch = async () => {
      throw new Error("offline");
    };
    const facts = await lookUp({ egid: 1, lon: 7.5, lat: 47.5 }, f);
    expect(facts).toEqual({
      register: null,
      roof: null,
      hectare: null,
      group: null,
      osmSolar: null,
    });
  });

  it("asks Overpass again on its own when it was busy", async () => {
    const calls: string[] = [];
    let busy = true;
    const f: Fetch = async (url) => {
      calls.push(url);
      if (url.includes("overpass")) return { ok: !busy, json: async () => ({ elements: [] }) };
      return { ok: true, json: async () => ({ results: [{ attributes: GWR }] }) };
    };
    const picked = { egid: 4, lon: 7.5, lat: 47.5 };
    expect((await lookUp(picked, f)).osmSolar).toBeNull();
    busy = false;
    expect((await lookUp(picked, f)).osmSolar).toEqual({ photovoltaic: 0, thermal: 0, other: 0 });
    expect(calls.filter((u) => u.includes("overpass"))).toHaveLength(2);
    expect(calls.filter((u) => u.includes("geo.admin"))).toHaveLength(3);
  });

  it("does not wait for Overpass beyond its time limit", async () => {
    vi.useFakeTimers();
    const f: Fetch = async (url) =>
      url.includes("overpass")
        ? new Promise(() => undefined)
        : { ok: true, json: async () => ({ results: [{ attributes: GWR }] }) };
    const job = lookUp({ egid: 3, lon: 7.5, lat: 47.5 }, f);
    await vi.advanceTimersByTimeAsync(6000);
    const facts = await job;
    vi.useRealTimers();
    expect(facts.register?.egid).toBe(441428);
    expect(facts.osmSolar).toBeNull();
  });

  it("asks again after an empty answer", async () => {
    let calls = 0;
    const f: Fetch = async () => {
      calls++;
      throw new Error("offline");
    };
    const picked = { egid: 2, lon: 7.5, lat: 47.5 };
    await lookUp(picked, f);
    await lookUp(picked, f);
    expect(calls).toBe(8);
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

describe("locate", () => {
  it("reads the register point of a building by EGID", async () => {
    const calls: string[] = [];
    const fetcher: Fetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        json: async () => ({ results: [{ geometry: { x: 7.582214, y: 47.55211 } }] }),
      };
    };
    expect(await locate(442141, fetcher)).toEqual({ lon: 7.582214, lat: 47.55211 });
    expect(calls[0]).toContain("searchText=442141");
    expect(calls[0]).toContain("sr=4326");
  });

  it("gives null when the register has no such building or does not answer", async () => {
    const empty: Fetch = async () => ({ ok: true, json: async () => ({ results: [] }) });
    const down: Fetch = async () => {
      throw new Error("offline");
    };
    expect(await locate(1, empty)).toBeNull();
    expect(await locate(1, down)).toBeNull();
  });
});
