import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeatLoop } from "./HeatLoop";

describe("HeatLoop", () => {
  it("describes the picture for screen readers", () => {
    render(<HeatLoop />);
    expect(screen.getByRole("img").getAttribute("alt")).toContain("warms the house");
  });

  it("offers a still picture to readers who ask for reduced motion", () => {
    const { container } = render(<HeatLoop />);
    const still = container.querySelector('source[media="(prefers-reduced-motion: reduce)"]');
    expect(still?.getAttribute("srcset")).toMatch(/heat-loop-still\.png/);
    expect(container.querySelector("img")?.getAttribute("src")).toMatch(/heat-loop\.webp/);
  });
});
