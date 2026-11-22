import { useCallback, useEffect, useState } from "react";
import { href, parse } from "./route";
import { stepAt, TOUR, tourKey, tourRequested } from "./tour";

const coarse = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(pointer: coarse)").matches;

/** Drop ?tour=1 from the address once the tour ends, so a reload opens the console as usual. */
function forgetTour() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("tour")) return;
  url.searchParams.delete("tour");
  window.history.replaceState(window.history.state, "", url);
}

/**
 * The walk-through the pitch hands over to: A goes one step on, Shift+A or Backspace one back, Esc
 * ends it. Each step is a page and a month; the month controls stay the operator's in between.
 * Returns the step shown (null when no tour runs) and the controls for the touch button.
 */
export function useTour(onMonth: (m: number) => void) {
  const [step, setStep] = useState<number | null>(() =>
    typeof window !== "undefined" && tourRequested(window.location.search, window.location.hash)
      ? 0
      : null,
  );

  // Show the step: open its page, set its month
  useEffect(() => {
    if (step === null) return;
    const s = stepAt(step);
    onMonth(s.month);
    if (parse(window.location.hash).route !== s.route) window.location.hash = href(s.route);
  }, [step, onMonth]);

  const go = useCallback((key: "next" | "back" | "end") => {
    if (key === "end") {
      setStep(null);
      forgetTour();
      return;
    }
    setStep((i) => {
      if (i === null) return 0;
      return Math.min(Math.max(i + (key === "next" ? 1 : -1), 0), TOUR.length - 1);
    });
  }, []);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const key = tourKey(e);
      if (key === null) return;
      if (step === null && key !== "next") return;
      e.preventDefault();
      go(key);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [step, go]);

  return { step, go };
}

/** A quiet corner note: where the tour is and the key that moves it; on a touch screen, a button. */
export function TourHint({
  step,
  onNext,
  onEnd,
}: {
  step: number;
  onNext: () => void;
  onEnd: () => void;
}) {
  const [touch] = useState(coarse);
  const last = step >= TOUR.length - 1;
  return (
    <div
      data-tour-hint
      aria-live="polite"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex items-center gap-2 rounded-full bg-white/90 py-1.5 pr-1.5 pl-3.5 text-[13px] text-label-2 tabular-nums ring-1 ring-black/[0.08] backdrop-blur print:hidden"
    >
      {touch ? (
        <>
          <span>
            {step + 1} / {TOUR.length}
          </span>
          <button
            type="button"
            onClick={last ? onEnd : onNext}
            className="rounded-full px-3 py-1 font-medium text-blue hover:bg-surface"
          >
            {last ? "Done" : "Next"}
          </button>
        </>
      ) : (
        <span className="pr-2">
          {step + 1} / {TOUR.length} ·{" "}
          {last ? (
            <>
              <kbd className="font-sans">Esc</kbd> ends
            </>
          ) : (
            <>
              <kbd className="font-sans font-semibold text-label">A</kbd> next
            </>
          )}
        </span>
      )}
    </div>
  );
}
