import { describe, expect, it } from "vitest";
import { targetFor } from "./target";

describe("targetFor", () => {
  it("keeps Byfangweg 18 as the default", () => {
    expect(targetFor("").name).toBe("Byfangweg 18");
    expect(targetFor("?at=somewhere").name).toBe("Byfangweg 18");
  });

  it("points the demo at FHNW Campus Dreispitz with ?at=fhnw", () => {
    const t = targetFor("?at=fhnw");
    expect(t.name).toBe("FHNW Campus Dreispitz");
    expect(t.transcript).toContain("FHNW Campus Dreispitz");
    expect(t.showBuildingCard).toBe(false);
  });

  it("knows each target's building in the register, for the map's hand-over", () => {
    expect(targetFor("").building.egid).toBe(442141);
    expect(targetFor("?at=fhnw").building.egid).toBe(243058419);
  });
});
