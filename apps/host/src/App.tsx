import { DEMO_HOST, type AppAuth, type HouseFeed, type JobFeed } from "@kachel/db";
import { HeatLoop, SignIn, useSession } from "@kachel/ui";
import { Chat } from "./chat/Chat";
import type { ChatModel } from "./chat/model";
import type { ChatData } from "./chat/tools";
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
  chat,
}: {
  feed: JobFeed;
  house: HouseFeed;
  auth: AppAuth;
  local: boolean;
  /** The local model and the house data it may read (#26); no panel without it. */
  chat?: { model: ChatModel; data: ChatData };
}) {
  const email = useSession(auth);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-idle/40 px-4 py-4 sm:px-6">
        <HeatLoop variant="wide" className="h-12 w-auto shrink-0 sm:h-16" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">Kachel</h1>
          <p className="text-sm text-idle">Your house, your heat, your servers.</p>
        </div>
        {email && (
          <div className="flex w-full items-baseline justify-between gap-3 text-sm sm:block sm:w-auto sm:text-right">
            <p className="min-w-0 truncate text-idle">{email}</p>
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="shrink-0 underline"
            >
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
          {chat && <Chat model={chat.model} data={chat.data} />}
        </div>
      )}
    </main>
  );
}
