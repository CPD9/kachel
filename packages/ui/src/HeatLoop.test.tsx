import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeatLoop } from "./HeatLoop";

const reducedMotion = 'source[media="(prefers-reduced-motion: reduce)"]';

describe("HeatLoop", () => {
  it("describes the picture for screen readers", () => {
    render(<HeatLoop />);
    expect(screen.getByRole("img").getAttribute("alt")).toContain("warms the house");
  });

  it("offers a still picture to readers who ask for reduced motion", () => {
    const { container } = render(<HeatLoop />);
    expect(container.querySelector(reducedMotion)?.getAttribute("srcset")).toMatch(
      /heat-loop-still\.png/,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/heat-loop\.webp/);
  });

  it("shows the wide crop and its still when asked", () => {
    const { container } = render(<HeatLoop variant="wide" />);
    expect(container.querySelector(reducedMotion)?.getAttribute("srcset")).toMatch(
      /heat-loop-wide-still\.png/,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/heat-loop-wide\.webp/);
    expect(container.querySelector("img")?.getAttribute("alt")).toContain("warms the house");
  });
});
