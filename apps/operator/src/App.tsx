import { useMemo, useState } from "react";
import { chf, offsetLabel } from "./format";
import { fleetMonth, fleetYear, MONTH_NAMES, MONTHS, type MonthsFile } from "./fleet/months";
import { buyerRows, useLive, type OperatorSource } from "./live/live";
import { AddBuilding } from "./pages/AddBuilding";
import { Billing } from "./pages/Billing";
import { Buildings, type NewBuilding } from "./pages/Buildings";
import { Jobs } from "./pages/Jobs";
import { Quotes } from "./pages/Quotes";
import { Today } from "./pages/Today";
import { useRoute, type Route } from "./shell/route";
import { Shell } from "./shell/Shell";
import { TourHint, useTour } from "./shell/Tour";

/** Today in Basel, where the fleet's clock runs. */
function now() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Zurich",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const month = MONTH_NAMES.indexOf(get("month") as (typeof MONTH_NAMES)[number]);
  return { month, date: `${get("weekday")} ${get("day")} ${get("month")}.` };
}

const CRUMBS: Record<Route, { label: string; route?: Route }[]> = {
  today: [{ label: "Today" }],
  buildings: [{ label: "Buildings", route: "buildings" }, { label: "All buildings" }],
  "buildings/new": [{ label: "Buildings", route: "buildings" }, { label: "Add building" }],
  jobs: [{ label: "Jobs" }],
  quotes: [{ label: "Quotes", route: "quotes" }, { label: "New quote" }],
  billing: [{ label: "Billing", route: "billing" }, { label: "Settlement" }],
  "billing/year": [{ label: "Billing", route: "billing" }, { label: "The year" }],
};

/**
 * The DigitalHeat operator console: Today, Buildings, Jobs, Quotes and Billing over the
 * scheduler's model of 100 synthetic homes in Basel and Bern, with the buyers and their jobs live
 * from Supabase once the operator signs in. The month and outdoor temperature chosen under
 * Billing hold for every page.
 */
export function App({
  source,
  file = MONTHS,
  startMonth,
}: {
  source?: OperatorSource;
  file?: MonthsFile;
  startMonth?: number;
}) {
  const [today] = useState(now);
  const { route, query } = useRoute();
  const [month, setMonth] = useState(startMonth ?? today.month);
  const [offset, setOffset] = useState(0);
  const [added, setAdded] = useState<NewBuilding[]>([]);
  const live = useLive(source);
  const tour = useTour(setMonth);

  const m = useMemo(() => fleetMonth(file, { month, offset }), [file, month, offset]);
  const brightest = useMemo(
    () => Math.max(...fleetYear(file, 0).months.flatMap((mo) => mo.houses.map((h) => h.servedKw))),
    [file],
  );
  const rows = useMemo(
    () => buyerRows(live.buyers, live.state.jobs.values()),
    [live.buyers, live.state.jobs],
  );
  const name = MONTH_NAMES[month] ?? "";
  const model = `Model: 2025 weather${offset !== 0 ? `, ${offsetLabel(offset)} °C` : ""}, synthetic homes`;
  const dateLine =
    month === today.month && offset === 0
      ? today.date
      : `In ${name}${offset !== 0 ? ` at ${offsetLabel(offset)} °C` : ""}:`;

  return (
    <Shell
      route={route}
      crumbs={CRUMBS[route]}
      model={model}
      balance={
        <>
          <span className="text-label-2">Balance </span>
          <span data-reading="Balance" className="font-semibold">
            <span data-value>{chf(m.money.margin)}</span>
          </span>
          <span className="hidden text-label-2 sm:inline"> in {name}</span>
        </>
      }
    >
      {route === "today" && (
        <Today
          month={m}
          monthName={name}
          dateLine={dateLine}
          brightest={brightest}
          live={live}
          rows={rows}
          source={source}
        />
      )}
      {route === "buildings" && (
        <Buildings key={query.toString()} month={m} monthName={name} added={added} query={query} />
      )}
      {route === "buildings/new" && <AddBuilding onAdd={(b) => setAdded((a) => [b, ...a])} />}
      {route === "jobs" && <Jobs live={live} rows={rows} source={source} />}
      {route === "quotes" && <Quotes month={month} monthName={name} offset={offset} />}
      {(route === "billing" || route === "billing/year") && (
        <Billing
          file={file}
          tab={route === "billing" ? "settlement" : "year"}
          month={month}
          monthName={name}
          offset={offset}
          onMonth={setMonth}
          onOffset={setOffset}
        />
      )}
      {tour.step !== null && (
        <TourHint step={tour.step} onNext={() => tour.go("next")} onEnd={() => tour.go("end")} />
      )}
    </Shell>
  );
}
