import { ArrowLeft, ArrowRight } from "lucide-react";
import { type CSSProperties, type ReactNode, type TouchEvent, useRef, useState } from "react";
import { card, lightCard } from "./ui";

export type SheetTab = { id: string; label: string; body: ReactNode };

/** A swipe counts once the finger has moved this far, in px. */
const SWIPE_PX = 40;

/**
 * Phones and tablets: the cards that sit around the map on a laptop, as one bottom sheet above
 * the follow-up bar. Tabs switch between the cards (tap, or swipe the card sideways); the handle
 * folds the sheet down to its tabs so the map shows (tap it, or swipe down and up). `back` and
 * `action` stand in for the presenter's Esc and "a" keys.
 */
export function Sheet({
  tabs,
  light = false,
  back,
  action,
  tab: controlled,
  onTab,
  style,
}: {
  tabs: SheetTab[];
  light?: boolean;
  back?: { label: string; onClick: () => void } | undefined;
  action?: { label: string; onClick: () => void; disabled?: boolean } | undefined;
  /** Picked tab, when the parent keeps it; otherwise the sheet keeps its own. */
  tab?: string;
  onTab?: (id: string) => void;
  style?: CSSProperties;
}) {
  const [own, setOwn] = useState(tabs[0]?.id ?? "");
  const [open, setOpen] = useState(true);
  const picked = controlled ?? own;
  const i = Math.max(
    0,
    tabs.findIndex((t) => t.id === picked),
  );
  const current = tabs[i];
  const pick = (id: string) => {
    setOwn(id);
    onTab?.(id);
    setOpen(true);
  };
  const start = useRef<{ x: number; y: number } | null>(null);
  const onStart = (e: TouchEvent) => {
    const t = e.touches[0];
    start.current = t ? { x: t.clientX, y: t.clientY } : null;
  };
  /** Sideways switches the card, down folds the sheet, up opens it again. */
  const onEnd = (e: TouchEvent, fold: boolean) => {
    const t = e.changedTouches[0];
    const s = start.current;
    start.current = null;
    if (!t || !s) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const next = tabs[i + (dx < 0 ? 1 : -1)];
      if (next) pick(next.id);
    } else if (fold && Math.abs(dy) > SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
      setOpen(dy < 0);
    }
  };

  const tone = light
    ? {
        box: lightCard,
        rail: "bg-black/[0.05]",
        on: "bg-white text-ink shadow-sm",
        off: "text-muted",
      }
    : { box: card, rail: "bg-white/[0.08]", on: "bg-white text-black", off: "text-white/60" };

  return (
    <section
      aria-label="Details"
      className={`${tone.box} absolute inset-x-3 mx-auto flex max-h-[min(56dvh,560px)] max-w-[560px] flex-col font-sans`}
      style={{ bottom: "var(--compact-sheet)", ...style }}
    >
      {tabs.length > 0 && (
        <div onTouchStart={onStart} onTouchEnd={(e) => onEnd(e, true)}>
          <button
            type="button"
            aria-label={open ? "Fold the details down" : "Show the details"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="tap relative grid h-5 w-full place-items-center"
          >
            <span className="h-1 w-10 rounded-full bg-current opacity-25" />
          </button>
          <div className={`flex items-center gap-1 rounded-full p-0.5 ${tone.rail}`}>
            {back && (
              <button
                type="button"
                aria-label={back.label}
                onClick={back.onClick}
                className={`grid size-11 shrink-0 place-items-center rounded-full ${tone.off}`}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            {tabs.length > 1 && (
              <div role="tablist" className="flex min-w-0 flex-1 gap-0.5">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={t.id === current?.id}
                    onClick={() => (t.id === current?.id ? setOpen((o) => !o) : pick(t.id))}
                    className={`min-h-11 min-w-0 flex-1 truncate rounded-full px-2 text-[13px] font-semibold transition-colors ${
                      t.id === current?.id ? tone.on : tone.off
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {tabs.length === 1 && (
              <p className="min-w-0 flex-1 truncate px-3 text-[13px] font-semibold">
                {tabs[0]?.label}
              </p>
            )}
          </div>
        </div>
      )}
      {open && current && (
        <div
          key={current.id}
          onTouchStart={onStart}
          onTouchEnd={(e) => onEnd(e, false)}
          className="mt-1 min-h-0 flex-1 animate-card-in overflow-y-auto overscroll-contain [scrollbar-width:none]"
        >
          {current.body}
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          disabled={action.disabled}
          className={`flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-clay px-4 text-[14px] font-semibold text-white hover:bg-clay-dark disabled:opacity-40 ${
            tabs.length ? "mt-2" : ""
          }`}
        >
          {action.label} <ArrowRight size={16} />
        </button>
      )}
    </section>
  );
}
