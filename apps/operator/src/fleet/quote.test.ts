import { describe, expect, it } from "vitest";
import config from "../../../../services/scheduler/config.json";
import { chf, chf2, count } from "../format";
import { quote } from "./quote";

describe("quote", () => {
  it("prices a million images from our measured speed: 3.2 server-hours, CHF 1.60", () => {
    const q = quote({ workload: "image", perDay: 1_000_000, zone: "Basel", month: 10, offset: 0 });
    const w = config.workloads.image_tagging;
    expect(q.unitPrice).toBeCloseTo((1e6 / w.measured_images_per_server_hour) * 0.5, 9);
    expect(chf2(q.unitPrice)).toBe("CHF 1.60");
    expect(q.serverHoursPerDay).toBeCloseTo(3.205, 3);
    expect(q.kwhPerDay).toBeCloseTo(3.205, 3);
    expect(q.houses).toBe(50);
    expect(q.doneBy).toBe(8);
    expect(q.capacityPerDay).toBeGreaterThan(0);
    expect(q.usefulShare).toBeGreaterThan(0.9);
  });

  it("paces video by the decoder: about 87 hours of footage a server-hour", () => {
    const q = quote({ workload: "video", perDay: 870, zone: "Switzerland", month: 0, offset: 0 });
    expect(q.serverHoursPerDay).toBeCloseTo(870 / (3600 / 41.4), 6);
    expect(q.houses).toBe(100);
  });
});

describe("Swiss money", () => {
  it("groups with an apostrophe", () => {
    expect(chf(29587)).toBe("CHF 29'587");
    expect(chf(-1234567)).toBe("−CHF 1'234'567");
    expect(count(1000)).toBe("1'000");
  });
});
