import { DEMO_HOST, type AppAuth, type JobFeed } from "@kachel/db";
import { HeatLoop, SignIn, useSession } from "@kachel/ui";
import { LiveJobs } from "./live/LiveJobs";

/**
 * Host app: the homeowner's view of their house, its heat and its servers.
 * Row level security shows a host only their own house, so the screen asks them to sign in.
 */
export function App({ feed, auth, local }: { feed: JobFeed; auth: AppAuth; local: boolean }) {
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
      {email && <LiveJobs key={email} feed={feed} />}
    </main>
  );
}
