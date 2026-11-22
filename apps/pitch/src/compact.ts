import { useSyncExternalStore } from "react";

/**
 * Phones and tablets: narrower than a laptop, or a touch screen. They get the compact layout:
 * the cards in one bottom sheet, buttons instead of the presenter's keys, and room for the notch
 * and the browser's bottom bar. Laptops and desktops keep the cards around the map.
 */
export const COMPACT_QUERY = "(max-width: 1023px), (pointer: coarse)";

const media = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(COMPACT_QUERY)
    : null;

function subscribe(onChange: () => void) {
  const m = media();
  m?.addEventListener("change", onChange);
  return () => m?.removeEventListener("change", onChange);
}

/** True on a phone or tablet (COMPACT_QUERY); follows a resize or rotation. */
export function useCompact(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => media()?.matches ?? false,
    () => false,
  );
}

/** Below the notch, for an overlay at the top of the screen. */
export const COMPACT_TOP = { top: "var(--compact-top)" } as const;
/** Above Mapbox's logo and the browser's bottom bar: the follow-up bar. */
export const COMPACT_BAR = { bottom: "var(--compact-bar)" } as const;
