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
});
