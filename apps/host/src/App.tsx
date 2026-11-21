import { HeatLoop } from "@kachel/ui";
import { useEffect, useState } from "react";
import type { HostAuth } from "./auth/session";
import { SignIn } from "./auth/SignIn";
import type { JobFeed } from "@kachel/db";
import { LiveJobs } from "./live/LiveJobs";

/**
 * Host app: the homeowner's view of their house, its heat and its servers.
 * Row level security shows a host only their own house, so the screen asks them to sign in.
 */
export function App({ feed, auth, local }: { feed: JobFeed; auth: HostAuth; local: boolean }) {
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    const stop = auth.onChange((next) => setEmail(next));
    auth.current().then(
      (first) => {
        if (current) setEmail((seen) => (seen === undefined ? first : seen));
      },
      () => {
        if (current) setEmail(null);
      },
    );
    return () => {
      current = false;
      stop();
    };
  }, [auth]);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="flex items-center gap-4 border-b border-idle/40 px-6 py-4">
        <HeatLoop variant="wide" className="h-16 w-auto" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Kachel</h1>
          <p className="text-sm text-idle">Your house, your heat, your servers.</p>
        </div>
        {email && (
          <div className="text-right text-sm">
            <p className="text-idle">{email}</p>
            <button type="button" onClick={() => void auth.signOut()} className="underline">
              Sign out
            </button>
          </div>
        )}
      </header>
      {email === null && <SignIn auth={auth} local={local} />}
      {email && <LiveJobs key={email} feed={feed} />}
    </main>
  );
}
