import { DEMO_HOST, type AppAuth, type HouseFeed, type JobFeed } from "@kachel/db";
import { HeatLoop, SignIn, useSession } from "@kachel/ui";
import { House } from "./house/House";
import { LiveJobs } from "./live/LiveJobs";

/**
 * Host app: the homeowner's view of their house, its heat and its servers.
 * Row level security shows a host only their own house, so the screen asks them to sign in.
 */
export function App({
  feed,
  house,
  auth,
  local,
}: {
  feed: JobFeed;
  house: HouseFeed;
  auth: AppAuth;
  local: boolean;
}) {
  const email = useSession(auth);

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
      {email === null && (
        <SignIn
          auth={auth}
          heading="Sign in to see your servers"
          {...(local ? { demo: DEMO_HOST } : {})}
        />
      )}
      {email && (
        <div key={email} className="mx-auto max-w-5xl space-y-5 px-4 py-5 sm:px-6">
          <House feed={house} />
          <div className="rounded-lg border border-grid bg-paper py-1">
            <LiveJobs feed={feed} />
          </div>
        </div>
      )}
    </main>
  );
}
