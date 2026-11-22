import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "../App";
import { TOUR, tourKey, tourRequested } from "./tour";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

/** The address as the tour leaves it. */
const page = () => window.location.hash;
const press = (key: string, opts: KeyboardEventInit = {}, target: Element | Window = window) => {
  act(() => {
    fireEvent.keyDown(target, { key, ...opts });
  });
  act(() => {
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
};
const pressed = () =>
  within(screen.getByRole("group", { name: "Month" }))
    .queryAllByRole("button", { pressed: true })
    .map((b) => b.getAttribute("aria-label"))
    .join();
const hint = () => document.querySelector("[data-tour-hint]")?.textContent ?? null;

describe("the A-key tour", () => {
  it("tells the short story in order: Today, settlement, the device", () => {
    expect(TOUR.map((s) => `${s.route}:${s.month}`)).toEqual([
      "today:10",
      "billing:10",
      "device:10",
    ]);
  });

  it("starts at Today with ?tour=1 and walks on with A, back with Shift+A or Backspace", () => {
    window.history.replaceState(null, "", "/?tour=1#/jobs");
    render(<App startMonth={2} />);
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(page()).toBe("#/today");
    expect(hint()).toBe("1 / 3 · A next");
    press("a");
    expect(page()).toBe("#/billing");
    expect(screen.getByRole("heading", { name: "Settlement for November" })).toBeTruthy();
    expect(pressed()).toBe("November");
    press("a");
    expect(page()).toBe("#/device");
    expect(screen.getByRole("heading", { name: "The device" })).toBeTruthy();
    expect(hint()).toBe("3 / 3 · Esc ends");
    press("a");
    expect(hint()).toBe("3 / 3 · Esc ends");
    press("A", { shiftKey: true });
    expect(page()).toBe("#/billing");
    press("Backspace");
    expect(page()).toBe("#/today");
    press("Escape");
    expect(hint()).toBeNull();
    expect(window.location.search).toBe("");
  }, 30_000); // walks the dashboards and the device page: slow on CI runners

  it("leaves the month to the operator between steps", () => {
    window.history.replaceState(null, "", "/?tour=1");
    render(<App />);
    press("a");
    fireEvent.click(screen.getByRole("button", { name: "March" }));
    expect(screen.getByRole("heading", { name: "Settlement for March" })).toBeTruthy();
    expect(pressed()).toBe("March");
  });

  it("shows nothing without ?tour=1 until the first A", () => {
    window.history.replaceState(null, "", "/#/billing");
    render(<App startMonth={2} />);
    expect(hint()).toBeNull();
    press("Escape");
    press("Backspace");
    expect(page()).toBe("#/billing");
    press("a");
    expect(page()).toBe("#/today");
    expect(hint()).toBe("1 / 3 · A next");
  });

  it("never fires while typing, nor with a modifier key", () => {
    window.history.replaceState(null, "", "/?tour=1");
    render(<App />);
    act(() => {
      window.location.hash = "#/quotes";
    });
    press("Shift");
    expect(page()).toBe("#/quotes");
    const buyer = screen.getByDisplayValue("Rail operator");
    press("a", {}, buyer);
    press("Backspace", {}, buyer);
    press("a", { metaKey: true });
    press("a", { ctrlKey: true });
    press("a", { altKey: true });
    expect(page()).toBe("#/quotes");
    expect(hint()).toBe("1 / 3 · A next");
    // A radio takes no typing: A still moves on
    press("a", {}, screen.getByRole("radio", { name: "Bern only" }));
    expect(page()).toBe("#/billing");
  });

  it("reads the keys and the address", () => {
    const k = (key: string, more: Partial<KeyboardEvent> = {}) =>
      tourKey({
        key,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        target: null,
        ...more,
      });
    expect(k("a")).toBe("next");
    expect(k("A", { shiftKey: true })).toBe("back");
    expect(k("a", { repeat: true })).toBeNull();
    expect(k("Backspace", { shiftKey: true })).toBeNull();
    expect(k("b")).toBeNull();
    const area = document.createElement("textarea");
    const select = document.createElement("select");
    expect(k("a", { target: area })).toBeNull();
    expect(k("a", { target: select })).toBeNull();
    const slider = Object.assign(document.createElement("input"), { type: "range" });
    expect(k("a", { target: slider })).toBe("next");
    expect(tourRequested("?tour=1", "")).toBe(true);
    expect(tourRequested("", "#/today?tour=1")).toBe(true);
    expect(tourRequested("?tour=0", "#/today")).toBe(false);
  });
});
