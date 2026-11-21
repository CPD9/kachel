import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatePill } from "./StatePill";

describe("StatePill", () => {
  it("says why a paused job is paused", () => {
    render(<StatePill state="PAUSED" />);
    expect(screen.getByText("Paused: no heat sink").dataset["state"]).toBe("PAUSED");
  });
});
