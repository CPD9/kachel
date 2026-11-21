import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeatLoop } from "./HeatLoop";
import svg from "./heat-loop.svg?raw";

describe("HeatLoop", () => {
  it("describes the picture for screen readers", () => {
    render(<HeatLoop />);
    expect(screen.getByRole("img").getAttribute("alt")).toContain("warms the house");
  });

  it("stands still for readers who ask for reduced motion", () => {
    expect(svg).toMatch(/@media \(prefers-reduced-motion: reduce\)[^}]*animation: none/);
  });
});
