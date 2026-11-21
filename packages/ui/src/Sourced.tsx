import { useId, type ReactNode } from "react";

/**
 * A number with where it comes from: the source shows on hover, or on focus for a keyboard
 * or a tap. `align` keeps the note on screen for a number near the right edge.
 */
export function Sourced({
  children,
  source,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  source: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  const id = useId();
  return (
    <span
      tabIndex={0}
      aria-describedby={id}
      className={`group relative cursor-help underline decoration-slate/60 decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-glacier ${className}`}
    >
      {children}
      <span
        role="tooltip"
        id={id}
        className={`pointer-events-none absolute hidden top-full z-20 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-grid bg-paper p-3 text-left text-xs leading-relaxed font-normal tracking-normal normal-case text-ink shadow-lg group-hover:block group-focus:block ${align === "right" ? "right-0" : "left-0"}`}
      >
        {source}
      </span>
    </span>
  );
}
