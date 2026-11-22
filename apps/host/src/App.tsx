import {
  DEMO_HOST,
  type AppAuth,
  type DecisionFeed,
  type HouseFeed,
  type JobFeed,
} from "@kachel/db";
import { SignIn, useSession } from "@kachel/ui";
import { Chat } from "./chat/Chat";
import type { ChatModel } from "./chat/model";
import type { ChatData } from "./chat/tools";
import { House } from "./house/House";
import { LiveJobs } from "./live/LiveJobs";
import { Why } from "./live/Why";

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
  decisions,
}: {
  feed: JobFeed;
  house: HouseFeed;
  auth: AppAuth;
  local: boolean;
  /** The local model and the house data it may read (#26); no panel without it. */
  chat?: { model: ChatModel; data: ChatData };
  /** The scheduler's live decisions (#191); no panel without them. */
  decisions?: DecisionFeed;
}) {
  const email = useSession(auth);

  return (
    <main className="min-h-screen bg-white font-sans text-label">
      <header className="border-b border-separator">
        <nav className="mx-auto flex max-w-6xl items-baseline gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-xl font-semibold tracking-tight">Kachel</h1>
          <span className="text-[15px] text-secondary">Your house</span>
          {email && (
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="ml-auto text-[15px] text-action hover:underline"
            >
              Sign out
            </button>
          )}
        </nav>
      </header>
      {email === null && (
        <div className="bg-fill px-4 py-6 sm:py-10">
          <SignIn
            auth={auth}
            heading="Sign in to see your servers"
            {...(local ? { demo: DEMO_HOST } : {})}
          />
        </div>
      )}
      {email && (
        <div
          key={email}
          className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6 sm:py-14 lg:px-8"
        >
          <House
            feed={house}
            servers={
              <div className="space-y-12">
                <LiveJobs feed={feed} />
                {decisions && <Why feed={decisions} />}
              </div>
            }
          />
          {chat && <Chat model={chat.model} data={chat.data} />}
        </div>
      )}
    </main>
  );
}
