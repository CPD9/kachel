import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  DEFAULT_MAP_URL,
  DEFAULT_OPERATOR_URL,
  FADE_MS,
  mapBaseFor,
  mapUrl,
  NO_GLOBE_HOLD_MS,
  operatorBaseFor,
  operatorUrl,
  PUBLIC_OPERATOR_URL,
} from "./handoff";
import { targetFor } from "./target";

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
  expect(screen.getByText(/so your data stays in the house/)).toBeTruthy();
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

it("in a deployed build without VITE_MAP_URL, says so instead of opening localhost", () => {
  vi.stubEnv("VITE_MAPBOX_TOKEN", "");
  vi.stubEnv("VITE_MAP_URL", "");
  vi.stubEnv("DEV", false);
  const go = vi.fn();
  render(<App go={go} />);
  fireEvent.click(screen.getByLabelText("Presentation mode"));
  act(() => vi.advanceTimersByTime(3000));
  act(() => vi.advanceTimersByTime(NO_GLOBE_HOLD_MS));
  act(() => vi.advanceTimersByTime(FADE_MS));
  expect(go).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("VITE_MAP_URL");
});

it("uses VITE_MAP_URL, else localhost only in dev", () => {
  expect(mapBaseFor("https://map.example", false)).toBe("https://map.example");
  expect(mapBaseFor(undefined, true)).toBe(DEFAULT_MAP_URL);
  expect(mapBaseFor("", false)).toBeNull();
});

it("builds the map's address from VITE_MAP_URL, at the demo target's building", () => {
  expect(mapUrl("http://stage.local:8080")).toBe("http://stage.local:8080/?egid=442141&card=1");
  // ?at=fhnw hands over at FHNW Campus Dreispitz
  expect(mapUrl("http://localhost:5175", targetFor("?at=fhnw").building.egid)).toBe(
    "http://localhost:5175/?egid=243058419&card=1",
  );
});

it("uses VITE_OPERATOR_URL, else localhost in dev, else the public operator console", () => {
  expect(operatorBaseFor("https://ops.example", false)).toBe("https://ops.example");
  expect(operatorBaseFor(undefined, true)).toBe(DEFAULT_OPERATOR_URL);
  expect(operatorBaseFor("", false)).toBe(PUBLIC_OPERATOR_URL);
});

it("opens the operator console at Today with its tour on", () => {
  expect(operatorUrl("http://localhost:5177")).toBe("http://localhost:5177/?tour=1#/today?tour=1");
  expect(operatorUrl(PUBLIC_OPERATOR_URL)).toBe(
    "https://operator-omega-jade.vercel.app/?tour=1#/today?tour=1",
  );
});
