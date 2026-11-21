import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { Scene } from "./scene/viewer";

function fakeScene(): Scene {
  let on = true;
  return {
    time: () => new Date("2026-11-21T15:25:00Z"),
    playing: () => on,
    setPlaying: (v) => {
      on = v;
    },
    flyTo: vi.fn(async () => undefined),
    tilesLoaded: async () => undefined,
    setTime: vi.fn(),
    onPick: () => () => undefined,
    viewArea: () => ({ west: 7.5, south: 47.5, east: 7.7, north: 47.6 }),
    showNetworks: vi.fn(),
    showHomeServers: vi.fn(),
    destroy: vi.fn(),
  };
}

afterEach(cleanup);

describe("map app", () => {
  it("credits swisstopo and OpenStreetMap on screen", () => {
    render(<App start={() => new Promise(() => undefined)} />);
    expect(screen.getByText("© swisstopo")).toBeTruthy();
    expect(screen.getByText("© OpenStreetMap contributors (ODbL)")).toBeTruthy();
  });

  it("shows the Swiss time and pauses the day", async () => {
    const scene = fakeScene();
    render(<App start={() => Promise.resolve(scene)} />);
    expect(await screen.findByText("16:25")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    });
    expect(scene.playing()).toBe(false);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("flies out from Basel to the globe", async () => {
    const scene = fakeScene();
    render(<App start={() => Promise.resolve(scene)} />);
    const places = await screen.findByRole("navigation", { name: "Places" });
    const names = Array.from(places.querySelectorAll("button")).map((b) => b.textContent);
    expect(names).toEqual(["Basel", "Bern", "Switzerland", "Neighbours", "Globe"]);
    fireEvent.click(screen.getByRole("button", { name: "Switzerland" }));
    expect(scene.flyTo).toHaveBeenCalledWith(expect.objectContaining({ name: "Switzerland" }), 4);
  });

  it("offers the tour and shows its first caption when started", async () => {
    const scene = fakeScene();
    render(<App start={() => Promise.resolve(scene)} />);
    const tourButton = await screen.findByRole("button", { name: "Tour" });
    await act(async () => {
      fireEvent.click(tourButton);
    });
    expect(await screen.findByText(/Basel at dusk/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause tour" })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    });
  });

  it("says so when the map cannot start", async () => {
    render(<App start={() => Promise.reject(new Error("no WebGL"))} />);
    expect((await screen.findByRole("alert")).textContent).toContain("could not start");
  });
});
