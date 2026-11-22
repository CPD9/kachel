import { Buyers } from "../live/Buyers";
import type { BuyerRow, Live, OperatorSource } from "../live/live";
import { Why } from "../live/Why";
import { href } from "../shell/route";
import { PageHead } from "../shell/Shell";
import { primary } from "../ui";

/** The buyers and their jobs, live from Supabase, and why the scheduler decided as it did. */
export function Jobs({
  live,
  rows,
  source,
}: {
  live: Live;
  rows: BuyerRow[];
  source: OperatorSource | undefined;
}) {
  return (
    <>
      <PageHead
        title="Jobs"
        action={
          <a href={href("quotes")} className={primary}>
            New quote
          </a>
        }
      />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Buyers live={live} rows={rows} source={source} />
        {source?.decisions && <Why feed={source.decisions} signedIn={Boolean(live.email)} />}
      </div>
    </>
  );
}
