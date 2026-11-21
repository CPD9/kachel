import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("host app", () => {
  it("shows the house heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Kachel" })).toBeTruthy();
  });
});
