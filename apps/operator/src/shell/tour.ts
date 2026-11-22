import type { Route } from "./route";

/** One stop of the walk-through: a page and the month it shows. */
export interface TourStep {
  route: Route;
  month: number;
  label: string;
}

const NOVEMBER = 10;
const JULY = 6;
const JANUARY = 0;

/**
 * The DigitalHeat story the pitch hands over to: what needs you today, every building, the rail
 * operator's tagging quote, November's settlement, the year, July's summer drop, and January's
 * winter peak to end on.
 */
export const TOUR: readonly TourStep[] = [
  { route: "today", month: NOVEMBER, label: "Today" },
  { route: "buildings", month: NOVEMBER, label: "All buildings" },
  { route: "quotes", month: NOVEMBER, label: "Quote" },
  { route: "billing", month: NOVEMBER, label: "Settlement" },
  { route: "billing/year", month: NOVEMBER, label: "The year" },
  { route: "billing/year", month: JULY, label: "July" },
  { route: "billing/year", month: JANUARY, label: "January" },
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

/** Fields that take typed text; a key pressed in one belongs to the field, not the tour. */
export function isTyping(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
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
