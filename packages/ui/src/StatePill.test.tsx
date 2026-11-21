import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatePill } from "./StatePill";

describe("StatePill", () => {
  it("labels a paused job without guessing why", () => {
    render(<StatePill state="PAUSED" />);
    expect(screen.getByText("Paused").dataset["state"]).toBe("PAUSED");
  });
});
