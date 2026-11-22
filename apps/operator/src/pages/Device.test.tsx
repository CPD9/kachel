import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Device } from "./Device";

afterEach(cleanup);

describe("the device page", () => {
  it("says concept, not built, and shows the Carnot bound with our example", () => {
    render(<Device />);
    expect(screen.getByRole("heading", { name: "The device" })).toBeTruthy();
    expect(screen.getAllByText(/Concept, not built/).length).toBeGreaterThan(0);
    const carnot = document.querySelector("[data-carnot]")?.textContent ?? "";
    expect(carnot.replace(/\s/g, "")).toBe("η≤1−Tc/Th");
    expect(screen.getByText(/Our example/).parentElement?.textContent).toMatch(/≈ 15\.6%/);
    expect(document.body.textContent).not.toMatch(/self-sustain/i);
  });
});
