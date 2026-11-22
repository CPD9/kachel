import type { Route } from "./route";

/** One stop of the walk-through: a page and the month it shows. */
export interface TourStep {
  route: Route;
  month: number;
  label: string;
}

const NOVEMBER = 10;

/**
 * The DigitalHeat story the pitch hands over to, short: what needs you today, November's
 * settlement, and the device concept (heat pump and ORC turbine) to end on.
 */
export const TOUR: readonly TourStep[] = [
  { route: "today", month: NOVEMBER, label: "Today" },
  { route: "billing", month: NOVEMBER, label: "Settlement" },
  { route: "device", month: NOVEMBER, label: "The device" },
];

/** Step i, clamped to the tour. */
export const stepAt = (i: number): TourStep =>
  TOUR[Math.min(Math.max(i, 0), TOUR.length - 1)] ?? (TOUR[0] as TourStep);

/** `?tour=1`, in the address before the page or after it (#/today?tour=1). */
export function tourRequested(search: string, hash: string): boolean {
  const after = hash.split("?")[1] ?? "";
  return (
    new URLSearchParams(search).get("tour") === "1" ||
    new URLSearchParams(after).get("tour") === "1"
  );
}

/** Inputs that take no typed text: a slider, a radio or a button keeps A for the tour. */
const NOT_TEXT = new Set(["range", "radio", "checkbox", "button", "submit", "reset", "color"]);

/** Fields that take typed text; a key pressed in one belongs to the field, not the tour. */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !NOT_TEXT.has(target.type);
  return target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

export type TourKey = "next" | "back" | "end";

/** What a key press means to the tour: A on, Shift+A or Backspace back, Esc out. */
export function tourKey(
  e: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "target"> & {
    repeat?: boolean;
  },
): TourKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat === true || isTyping(e.target)) return null;
  const key = e.key.toLowerCase();
  if (key === "a") return e.shiftKey ? "back" : "next";
  if (e.shiftKey) return null;
  if (e.key === "Backspace") return "back";
  if (e.key === "Escape") return "end";
  return null;
}
