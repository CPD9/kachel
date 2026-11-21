import { beforeEach, describe, expect, it, vi } from "vitest";
import { byMunicipality, median, observationsQuery, parseObservations } from "./elcom";
import { SWISS_MEDIAN, clearPriceCache, electricityPrice, savedPrice, type Post } from "./prices";

const BERN = {
  data: {
    observations: [
      { municipality: "351", municipalityLabel: "Bern", operatorLabel: "ewb", value: 31.113 },
      { municipality: "351", municipalityLabel: "Bern", operatorLabel: "other", value: 30.0 },
      { municipality: "351", municipalityLabel: "Bern", operatorLabel: "third", value: 32.0 },
    ],
  },
};

const answering = (body: unknown, ok = true) =>
  vi.fn<Post>(async () => ({ ok, json: async () => body }));

beforeEach(clearPriceCache);

describe("ElCom query", () => {
  it("asks for 2027, households (H4), the standard product, by BFS number", () => {
    const q = observationsQuery([2701, 351]);
    expect(q).toContain('period: ["2027"]');
    expect(q).toContain('category: ["H4"]');
    expect(q).toContain('product: ["standard"]');
    expect(q).toContain('municipality: ["2701","351"]');
    expect(q).toContain("value(priceComponent: total)");
  });

  it("takes the median over a municipality's operators", () => {
    const m = byMunicipality(parseObservations(BERN));
    expect(m["351"]?.rpPerKwh).toBe(31.113);
    expect(m["351"]?.operators).toEqual(["ewb", "other", "third"]);
    expect(median([1, 3])).toBe(2);
    expect(median([])).toBeNull();
    expect(parseObservations({ errors: [] })).toEqual([]);
  });
});

describe("saved prices", () => {
  it("has every Basel-Stadt municipality and Bern", () => {
    expect(savedPrice(2701).chfPerKwh).toBeCloseTo(0.3342, 6);
    expect(savedPrice(2703).municipality).toBe("Riehen");
    expect(savedPrice(351).municipality).toBe("Bern");
    expect(savedPrice(351).kind).toBe("saved");
  });

  it("falls back to the Swiss median elsewhere", () => {
    expect(savedPrice(261)).toBe(SWISS_MEDIAN); // Zürich is not saved
    expect(savedPrice(null)).toBe(SWISS_MEDIAN);
    expect(SWISS_MEDIAN.chfPerKwh).toBeCloseTo(0.26557, 6);
  });
});

describe("live price", () => {
  it("asks ElCom once per municipality", async () => {
    const post = answering(BERN);
    const p = await electricityPrice(351, post, "/elcom/api/graphql");
    expect(p.kind).toBe("live");
    expect(p.chfPerKwh).toBeCloseTo(0.31113, 6);
    expect(p.source).toContain("(live)");
    await electricityPrice(351, post, "/elcom/api/graphql");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]?.[0]).toBe("/elcom/api/graphql");
  });

  it("uses the saved price when ElCom does not answer, and asks again next time", async () => {
    const post = answering({}, false);
    expect((await electricityPrice(2701, post)).kind).toBe("saved");
    await electricityPrice(2701, post);
    expect(post).toHaveBeenCalledTimes(2);
    const broken = vi.fn<Post>(async () => {
      throw new Error("offline");
    });
    expect(await electricityPrice(261, broken)).toBe(SWISS_MEDIAN);
  });
});
