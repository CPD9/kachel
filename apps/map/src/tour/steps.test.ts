import { describe, expect, it, vi } from "vitest";
import { latestOnly } from "../building/latest";
import type { Scene } from "../scene/viewer";
import { tourHouse, tourSteps } from "./steps";
import { createTour } from "./tour";

function fakeScene(tiles: Promise<void>): Scene {
  return {
    time: () => new Date(),
    playing: () => true,
    setPlaying: vi.fn(),
    flyTo: vi.fn(async () => undefined),
    tilesLoaded: () => tiles,
    setTime: vi.fn(),
    onPick: () => () => undefined,
    viewArea: () => ({ west: 7.5, south: 47.5, east: 7.7, north: 47.6 }),
    showNetworks: vi.fn(),
    showHomeServers: vi.fn(),
    highlightBuilding: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("tour steps", () => {
  it("picks a Basel fleet house in a high-demand hectare", () => {
    const h = tourHouse();
    expect(h?.city).toBe("Basel");
    expect(h?.hectareHeatMwh).toBeGreaterThan(700);
  });

  it("flies Basel, opens the building, switches both layers on, ends on Switzerland", async () => {
    const scene = fakeScene(Promise.resolve());
    const calls: string[] = [];
    const deps = {
      scene,
      openBuilding: vi.fn(() => calls.push("card")),
      closeCards: vi.fn(),
      setNetworksOn: vi.fn((on: boolean) => calls.push(`networks ${on}`)),
      setServersOn: vi.fn((on: boolean) => calls.push(`servers ${on}`)),
      now: new Date("2026-11-21T08:00:00Z"),
    };
    let ms = 0;
    await createTour(
      tourSteps(deps),
      () => undefined,
      async (t) => {
        ms += t;
      },
    ).start();
    const views = vi.mocked(scene.flyTo).mock.calls.map(([v]) => v.name);
    expect(views[0]).toBe("Basel");
    expect(views.at(-1)).toBe("Switzerland");
    expect(calls).toEqual([
      "networks false",
      "servers false",
      "card",
      "networks true",
      "servers true",
    ]);
    // About 40 s on stage; here the tiles are instant, so only the dwells count.
    expect(ms).toBeGreaterThanOrEqual(20_000);
    expect(ms).toBeLessThanOrEqual(45_000);
  });

  it("still finishes when the tiles never load", async () => {
    const scene = fakeScene(new Promise(() => undefined));
    let ms = 0;
    await createTour(
      tourSteps({
        scene,
        openBuilding: vi.fn(),
        closeCards: vi.fn(),
        setNetworksOn: vi.fn(),
        setServersOn: vi.fn(),
      }),
      () => undefined,
      async (t) => {
        ms += t;
      },
    ).start();
    expect(ms).toBeLessThanOrEqual(60_000);
  });
});

describe("latest only", () => {
  it("drops an answer that arrives after a newer request", async () => {
    const applied: string[] = [];
    const l = latestOnly();
    let finishSlow: (v: string) => void = () => undefined;
    l.run(new Promise<string>((r) => (finishSlow = r)), (v) => applied.push(v));
    l.run(Promise.resolve("new"), (v) => applied.push(v));
    finishSlow("old");
    await new Promise((r) => setTimeout(r, 0));
    expect(applied).toEqual(["new"]);
  });
});
