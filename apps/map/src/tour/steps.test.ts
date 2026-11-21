import { describe, expect, it, vi } from "vitest";
import { latestOnly } from "../building/latest";
import type { Scene } from "../scene/viewer";
import { TOUR_BUILDING, tourSteps } from "./steps";
import { createTour } from "./tour";

function fakeScene(tiles: Promise<void>, inTiles = 0, ownModel = false): Scene {
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
    highlightBuilding: vi.fn(() => 0),
    highlightedCount: () => inTiles,
    ownModel: () => ownModel,
    showMarker: vi.fn(),
    destroy: vi.fn(),
  };
}

describe("tour steps", () => {
  it("stops at FHNW Campus Dreispitz, by its register number", () => {
    expect(TOUR_BUILDING.egid).toBe(243058419);
    expect(TOUR_BUILDING.name).toBe("FHNW Campus Dreispitz");
  });

  it("stands our block model in for the campus when the 3D data lacks it", async () => {
    const scene = fakeScene(Promise.resolve(), 0, true);
    const setNotIn3D = vi.fn();
    await createTour(
      tourSteps({
        scene,
        openBuilding: vi.fn(),
        setNotIn3D,
        closeCards: vi.fn(),
        setNetworksOn: vi.fn(),
        setServersOn: vi.fn(),
      }),
      () => undefined,
      async () => undefined,
    ).start();
    // The model is coloured with the card open; no pin.
    expect(scene.highlightBuilding).toHaveBeenCalledWith(243058419);
    expect(vi.mocked(scene.showMarker).mock.calls.some(([m]) => m !== null)).toBe(false);
    expect(setNotIn3D).toHaveBeenCalledWith("model");
    expect(setNotIn3D.mock.calls.at(-1)).toEqual([false]);
  });

  it("falls back to a pin when the block model did not load", async () => {
    const scene = fakeScene(Promise.resolve());
    const setNotIn3D = vi.fn();
    const openBuilding = vi.fn();
    await createTour(
      tourSteps({
        scene,
        openBuilding,
        setNotIn3D,
        closeCards: vi.fn(),
        setNetworksOn: vi.fn(),
        setServersOn: vi.fn(),
      }),
      () => undefined,
      async () => undefined,
    ).start();
    expect(openBuilding).toHaveBeenCalledWith(TOUR_BUILDING);
    expect(scene.highlightBuilding).toHaveBeenCalledWith(243058419);
    // 6 storeys of 4 m, where the register puts it.
    expect(scene.showMarker).toHaveBeenCalledWith({
      lon: 7.606272,
      lat: 47.537456,
      heightM: 24,
    });
    expect(setNotIn3D).toHaveBeenCalledWith("pin");
    // The next stop takes the marker and the note away again.
    expect(vi.mocked(scene.showMarker).mock.calls.at(-1)).toEqual([null]);
    expect(setNotIn3D.mock.calls.at(-1)).toEqual([false]);
  });

  it("colours the building instead of a marker once the 3D data has it", async () => {
    const scene = fakeScene(Promise.resolve(), 1);
    const setNotIn3D = vi.fn();
    await createTour(
      tourSteps({
        scene,
        openBuilding: vi.fn(),
        setNotIn3D,
        closeCards: vi.fn(),
        setNetworksOn: vi.fn(),
        setServersOn: vi.fn(),
      }),
      () => undefined,
      async () => undefined,
    ).start();
    expect(vi.mocked(scene.showMarker).mock.calls.some(([m]) => m !== null)).toBe(false);
    expect(setNotIn3D).not.toHaveBeenCalledWith("pin");
    expect(setNotIn3D).not.toHaveBeenCalledWith("model");
  });

  it("flies Basel, opens the building, switches both layers on, ends on Switzerland", async () => {
    const scene = fakeScene(Promise.resolve());
    const calls: string[] = [];
    const deps = {
      scene,
      openBuilding: vi.fn(() => calls.push("card")),
      setNotIn3D: vi.fn(),
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
        setNotIn3D: vi.fn(),
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
