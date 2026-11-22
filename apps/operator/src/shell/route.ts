import { useEffect, useState } from "react";

export const ROUTES = [
  "today",
  "buildings",
  "buildings/new",
  "jobs",
  "quotes",
  "billing",
  "billing/year",
  "device",
] as const;
export type Route = (typeof ROUTES)[number];

/** The page in the address: #/buildings, #/billing/year. Anything else is Today. */
export function parse(hash: string): { route: Route; query: URLSearchParams } {
  const [path = "", q = ""] = hash.replace(/^#\/?/, "").split("?");
  const route = (ROUTES as readonly string[]).includes(path) ? (path as Route) : "today";
  return { route, query: new URLSearchParams(q) };
}

export const href = (route: Route, query?: Record<string, string>) =>
  `#/${route}${query ? `?${new URLSearchParams(query).toString()}` : ""}`;

export function useRoute() {
  const [hash, setHash] = useState(() =>
    typeof window === "undefined" ? "" : window.location.hash,
  );
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash);
      document.documentElement.scrollTop = 0;
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parse(hash);
}
