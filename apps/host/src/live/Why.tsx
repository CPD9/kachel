import { NO_DECISIONS, watchDecisions, type DecisionFeed } from "@kachel/db";
import { WhyDecision } from "@kachel/ui";
import { useEffect, useState } from "react";

/** The live loop's newest decisions for the host's house, as it appends them (#191). */
export function Why({ feed }: { feed: DecisionFeed }) {
  const [state, setState] = useState(NO_DECISIONS);
  useEffect(() => watchDecisions(feed, setState), [feed]);
  return (
    <div className="[&>section]:rounded-2xl [&>section]:border-separator [&>section]:bg-white [&>section]:p-6">
      <WhyDecision decisions={state.decisions} status={state.status} />
    </div>
  );
}
