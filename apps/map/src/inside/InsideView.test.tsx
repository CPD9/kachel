import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InsideView from "./InsideView";
import { stillsFor } from "./stills";

// jsdom has no WebGL: the 3D room stands in as a plain element.
vi.mock("./PlantRoom", () => ({ default: () => <div data-testid="plant-room" /> }));

afterEach(cleanup);

describe("inside view", () => {
  it("shows the campus pictures first for the campus, and never for a fleet house", () => {
    const campus = stillsFor("campus").map((s) => s.caption);
    const house = stillsFor("house").map((s) => s.caption);
    expect(campus[0]).toMatch(/campus in the pitch film/);
    expect(house.some((c) => /campus/.test(c))).toBe(false);
    expect(campus.slice(2)).toEqual(house);
  });

  it("opens the 3D room with the stills below, one large on click", async () => {
    const onClose = vi.fn();
    render(<InsideView of="house" onClose={onClose} />);
    expect(await screen.findByTestId("plant-room")).toBeTruthy();
    expect(screen.getByText(/the same for every fleet house/)).toBeTruthy();
    const strip = screen.getByRole("list", { name: "Renders" });
    expect(strip.querySelectorAll("img")).toHaveLength(stillsFor("house").length);
    fireEvent.click(within(strip).getByRole("button", { name: /One server in the rack/ }));
    expect(screen.getByRole("button", { name: "Back to 3D" })).toBeTruthy();
    // Escape closes the large still first, then the view.
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("button", { name: "Back to 3D" })).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
