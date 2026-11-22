import type { ReactNode } from "react";

/** Where the numbers above come from, folded away until asked for. */
export function Sources({
  children,
  summary = "Sources",
}: {
  children: ReactNode;
  summary?: string;
}) {
  return (
    <details className="group mt-4 text-sm">
      <summary className="cursor-pointer text-action marker:text-action">{summary}</summary>
      <div className="mt-2 space-y-1.5 text-xs leading-relaxed text-secondary [&_code]:font-mono [&_code]:text-label">
        {children}
      </div>
    </details>
  );
}
