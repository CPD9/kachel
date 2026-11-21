import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("console app", () => {
  it("lists the four job states", () => {
    render(<App />);
    const states = screen.getByRole("list", { name: "Job states" });
    expect(within(states).getAllByRole("listitem")).toHaveLength(4);
  });
});
