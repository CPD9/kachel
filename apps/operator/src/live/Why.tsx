import { NO_DECISIONS, watchDecisions, type DecisionFeed } from "@kachel/db";
import { WhyDecision } from "@kachel/ui";
import { useEffect, useState } from "react";

/**
 * The live loop's newest decisions across the fleet, once the operator is signed in (#191).
 * Row level security shows the operator every house's decisions.
 */
export function Why({ feed, signedIn }: { feed: DecisionFeed; signedIn: boolean }) {
  const [state, setState] = useState(NO_DECISIONS);
  useEffect(() => (signedIn ? watchDecisions(feed, setState) : undefined), [feed, signedIn]);
  if (!signedIn) return null;
  return <WhyDecision decisions={state.decisions} status={state.status} tone="dark" />;
}
