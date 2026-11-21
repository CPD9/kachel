import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(() => vi.unstubAllEnvs());

it("asks for a Mapbox token when none is set", () => {
  vi.stubEnv("VITE_MAPBOX_TOKEN", "");
  render(<App />);
  expect(screen.getByText(/VITE_MAPBOX_TOKEN/)).toBeTruthy();
});
