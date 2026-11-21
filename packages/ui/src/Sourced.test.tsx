import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sourced } from "./Sourced";

describe("Sourced", () => {
  it("ties the number to its source for screen readers and keyboards", () => {
    render(<Sourced source="kpis.computing_income_chf">CHF 15,538</Sourced>);
    const note = screen.getByRole("tooltip", { hidden: true });
    const value = note.parentElement;
    expect(value?.tabIndex).toBe(0);
    expect(value?.textContent).toMatch(/^CHF 15,538/);
    expect(value?.getAttribute("aria-describedby")).toBe(note.id);
    expect(note.textContent).toBe("kpis.computing_income_chf");
  });
});
