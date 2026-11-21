import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { FADE_MS, HOME_EGID, mapUrl, NO_GLOBE_HOLD_MS } from "./handoff";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("shows the landing page without a Mapbox token", () => {
  vi.stubEnv("VITE_MAPBOX_TOKEN", "");
  render(<App go={vi.fn()} />);
  expect(screen.getByText("Your heat, powered by computing.")).toBeTruthy();
});

it("without a token, hands the scripted intro straight over to the map at Byfangweg 18", () => {
  vi.stubEnv("VITE_MAPBOX_TOKEN", "");
  vi.stubEnv("VITE_MAP_URL", "");
  const go = vi.fn();
  render(<App go={go} />);
  fireEvent.click(screen.getByLabelText("Presentation mode"));
  // The scripted transcript sends itself after three seconds
  act(() => vi.advanceTimersByTime(3000));
  act(() => vi.advanceTimersByTime(400));
  expect(screen.getByText("Basel identified")).toBeTruthy();
  expect(go).not.toHaveBeenCalled();

  act(() => vi.advanceTimersByTime(NO_GLOBE_HOLD_MS - 400));
  // Fading to the map's background, then the page changes
  act(() => vi.advanceTimersByTime(FADE_MS));
  expect(go).toHaveBeenCalledWith("http://localhost:5175/?egid=442141&card=1");
});

it("builds the map's address from VITE_MAP_URL", () => {
  expect(mapUrl("http://stage.local:8080")).toBe(
    `http://stage.local:8080/?egid=${HOME_EGID}&card=1`,
  );
});
