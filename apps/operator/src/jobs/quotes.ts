import { quote, WORKLOADS, type Quote, type Workload, type Zone } from "../fleet/quote";

export type QuoteStatus = "draft" | "sent" | "accepted";

/**
 * Example quotes for the list: synthetic buyers and volumes (OUR examples), priced by the same
 * model as "New quote" for the chosen month. The rail operator is a kind of buyer, not a company.
 */
export const EXAMPLE_QUOTES: {
  id: string;
  buyer: string;
  workload: Workload;
  perDay: number;
  zone: Zone;
  status: QuoteStatus;
}[] = [
  {
    id: "q1",
    buyer: "Rail operator",
    workload: "image",
    perDay: 1_000_000,
    zone: "Basel",
    status: "accepted",
  },
  {
    id: "q2",
    buyer: "Rail operator",
    workload: "video",
    perDay: 1_000,
    zone: "Switzerland",
    status: "sent",
  },
  { id: "q3", buyer: "Video studio", workload: "video", perDay: 200, zone: "Bern", status: "sent" },
  {
    id: "q4",
    buyer: "3D rendering studio",
    workload: "image",
    perDay: 250_000,
    zone: "Basel",
    status: "draft",
  },
];

export interface QuoteRow {
  id: string;
  buyer: string;
  workload: Workload;
  volume: string;
  zone: Zone;
  status: QuoteStatus;
  q: Quote;
}

export function exampleQuotes(month: number, offset: number): QuoteRow[] {
  return EXAMPLE_QUOTES.map((e) => ({
    ...e,
    volume: `${new Intl.NumberFormat("en-US").format(e.perDay).replace(/,/g, "'")} ${WORKLOADS[e.workload].unit}`,
    q: quote({ workload: e.workload, perDay: e.perDay, zone: e.zone, month, offset }),
  }));
}
