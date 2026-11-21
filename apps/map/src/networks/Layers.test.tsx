import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fetch } from "../building/geoadmin";
import type { Scene } from "../scene/viewer";
import { Layers, useLayers } from "./Layers";
import { clearNetworkCache } from "./thermal";

const ONE_NETWORK = {
  results: [
    {
      id: "tn1",
      geometry: { coordinates: [7.6, 47.55] },
      properties: { name: "Fernwärme Basel", en_energysource: "Waste" },
    },
  ],
};

function fakeScene() {
  return {
    time: () => new Date(),
    playing: () => true,
    setPlaying: vi.fn(),
    flyTo: vi.fn(async () => undefined),
    tilesLoaded: async () => undefined,
    setTime: vi.fn(),
    onPick: () => () => undefined,
    viewArea: () => ({ west: 7.5, south: 47.5, east: 7.7, north: 47.6 }),
    showNetworks: vi.fn(),
    showHomeServers: vi.fn(),
    highlightBuilding: vi.fn(() => 0),
    highlightedCount: () => 0,
    showMarker: vi.fn(),
    destroy: vi.fn(),
  } satisfies Scene;
}

function Panel({ scene, fetcher }: { scene: Scene; fetcher?: Fetch }) {
  return <Layers {...useLayers(scene, fetcher)} />;
}

afterEach(() => {
  cleanup();
  clearNetworkCache();
});

describe("layers", () => {
  it("loads the networks in view and shows them", async () => {
    const scene = fakeScene();
    const fetcher: Fetch = async () => ({ ok: true, json: async () => ONE_NETWORK });
    render(<Panel scene={scene} fetcher={fetcher} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/District heating today/));
    });
    expect(await screen.findByText("1 network in view. Source: SFOE.")).toBeTruthy();
    expect(scene.showNetworks).toHaveBeenCalledWith([
      expect.objectContaining({ name: "Fernwärme Basel" }),
    ]);
  });

  it("says when the list was cut at the request limit", async () => {
    const many = {
      results: Array.from({ length: 500 }, (_, i) => ({
        id: `tn${i}`,
        geometry: { coordinates: [7.6, 47.55] },
        properties: { name: `Network ${i}` },
      })),
    };
    const fetcher: Fetch = async () => ({ ok: true, json: async () => many });
    render(<Panel scene={fakeScene()} fetcher={fetcher} />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/District heating today/));
    });
    expect(await screen.findByText(/The first 500 networks in view; zoom in for all/)).toBeTruthy();
  });

  it("labels the home servers as an illustration", () => {
    const scene = fakeScene();
    render(<Panel scene={scene} />);
    fireEvent.click(screen.getByLabelText(/heat from home servers/));
    expect(scene.showHomeServers).toHaveBeenCalledWith(true);
    expect(screen.getByText(/an illustration, not data/)).toBeTruthy();
  });
});
