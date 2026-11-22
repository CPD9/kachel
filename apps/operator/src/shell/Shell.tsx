import type { ReactNode } from "react";
import { href, type Route } from "./route";

/** The five places of the console; second-level things are tabs inside a page. */
export const NAV: { label: string; route: Route; section: Route[] }[] = [
  { label: "Today", route: "today", section: ["today"] },
  { label: "Buildings", route: "buildings", section: ["buildings", "buildings/new"] },
  { label: "Jobs", route: "jobs", section: ["jobs"] },
  { label: "Quotes", route: "quotes", section: ["quotes"] },
  { label: "Billing", route: "billing", section: ["billing", "billing/year"] },
];

/**
 * The console's frame: one light top bar (Kachel, the five places, the balance and the org),
 * then the breadcrumb and the model's label, then the page. On a phone the places wrap to a row
 * of their own under the bar.
 */
export function Shell({
  route,
  crumbs,
  model,
  balance,
  children,
}: {
  route: Route;
  crumbs: { label: string; route?: Route }[];
  model: string;
  balance: ReactNode;
  children: ReactNode;
}) {
  const links = NAV.map((n) => {
    const on = n.section.includes(route);
    return (
      <a
        key={n.route}
        href={href(n.route)}
        aria-current={on ? "page" : undefined}
        className={`rounded-lg px-2.5 py-1.5 text-[15px] whitespace-nowrap sm:px-3 ${on ? "bg-black/[0.06] font-semibold text-label" : "text-label-2 hover:text-label"}`}
      >
        {n.label}
      </a>
    );
  });
  return (
    <div className="min-h-screen bg-surface text-label">
      <header className="sticky top-0 z-30 border-b border-black/[0.08] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 sm:px-10">
          <a href={href("today")} className="text-[20px] font-semibold tracking-tight">
            Kachel
          </a>
          <nav aria-label="Console" className="hidden items-center gap-1 md:flex">
            {links}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-[14px]">
            <span data-balance className="tabular-nums">
              {balance}
            </span>
            <span className="hidden rounded-lg border border-sep px-3 py-1.5 sm:inline">
              DigitalHeat
            </span>
          </div>
        </div>
        <nav
          aria-label="Console, phone"
          className="flex justify-between overflow-x-auto border-t border-black/[0.06] px-2 py-1.5 md:hidden"
        >
          {links}
        </nav>
      </header>
      <div className="mx-auto max-w-[1440px] px-4 pb-16 sm:px-10">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 pt-4 text-[14px]">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-label-2">
              {crumbs.map((c, i) => (
                <li key={c.label} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden>›</span>}
                  {c.route && i < crumbs.length - 1 ? (
                    <a href={href(c.route)} className="text-blue hover:underline">
                      {c.label}
                    </a>
                  ) : (
                    <span className="text-label">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <p data-model className="text-label-2">
            {model}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The page's title, its one primary action, and its tabs. */
export function PageHead({
  eyebrow,
  title,
  action,
  tabs,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  tabs?: { label: string; route: Route; on: boolean }[];
}) {
  return (
    <div className="pt-5">
      {eyebrow && <p className="text-[15px] text-label-2">{eyebrow}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="max-w-[900px] text-[30px] leading-[1.12] font-semibold tracking-tight sm:text-[40px]">
          {title}
        </h1>
        {action}
      </div>
      {tabs && (
        <nav aria-label="Tabs" className="mt-5 flex gap-6 border-b border-sep">
          {tabs.map((t) => (
            <a
              key={t.route}
              href={href(t.route)}
              aria-current={t.on ? "page" : undefined}
              className={`-mb-px border-b-2 pb-2 text-[15px] ${t.on ? "border-label font-semibold" : "border-transparent text-label-2 hover:text-label"}`}
            >
              {t.label}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}

/** Where the numbers come from, behind one disclosure instead of underlines on every figure. */
export function Sources({ children }: { children: ReactNode }) {
  return (
    <details className="mt-4 text-[14px]">
      <summary className="cursor-pointer text-blue select-none">Sources</summary>
      <div className="mt-2 max-w-[880px] space-y-2 leading-relaxed text-label-2">{children}</div>
    </details>
  );
}

const PILL: Record<string, { bg: string; dot: string }> = {
  green: { bg: "bg-green/15", dot: "bg-green" },
  orange: { bg: "bg-orange/15", dot: "bg-orange" },
  red: { bg: "bg-red/15", dot: "bg-red" },
  blue: { bg: "bg-blue/12", dot: "bg-blue" },
  grey: { bg: "bg-black/[0.06]", dot: "bg-grey" },
};

/** A state as a small tinted pill with a dot. Colour is for state only. */
export function Pill({ tone, children }: { tone: keyof typeof PILL; children: ReactNode }) {
  const p = PILL[tone] ?? PILL.grey;
  return (
    <span
      data-pill={tone}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap ${p?.bg}`}
    >
      <span className={`inline-block size-2 rounded-full ${p?.dot}`} />
      {children}
    </span>
  );
}
