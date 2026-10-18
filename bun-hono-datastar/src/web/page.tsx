import { count as countRows, gte } from "drizzle-orm";
import { db } from "../db";
import { items } from "../schema";
import {
  cn,
  exhaustiveCheck,
  instantToDateForInteropWithDrizzle,
} from "../utils";
import type { State } from "../state";
import { BusyIcon } from "./components/busy";
import { Icon } from "./components/icon";
import { LivePage } from "./layout";
import { indicator, post } from "./post";

// The example page: the shared counter (src/state.ts), and a database query
// bounded by a Temporal instant. Like every page it is one function of
// state, rendered on load and again on every change over the tab's /updates
// stream.

const RECENT_ITEMS_WINDOW = Temporal.Duration.from({ hours: 24 });

// Timestamp columns are `Date` on the Drizzle side, so comparing them against a
// Temporal value needs the interop helper.
async function countItemsSince(since: Temporal.Instant): Promise<number> {
  const [row] = await db
    .select({ total: countRows() })
    .from(items)
    .where(gte(items.createdAt, instantToDateForInteropWithDrizzle(since)));
  return row?.total ?? 0;
}

type CounterTone = "idle" | "active";

function counterToneClass(tone: CounterTone): string {
  switch (tone) {
    case "idle":
      return "text-muted-foreground";
    case "active":
      return "text-foreground";
    default:
      return exhaustiveCheck(tone);
  }
}

export async function CounterPage({ state }: { state: Readonly<State> }) {
  const { count } = state;
  const tone: CounterTone = count === 0 ? "idle" : "active";
  const recentItems = await countItemsSince(
    Temporal.Now.instant().subtract(RECENT_ITEMS_WINDOW),
  );
  const incrementing = indicator("increment");

  return (
    <LivePage class="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6">
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-4">
          <p class="tracking-eyebrow text-primary text-sm font-medium uppercase">
            Bun + Hono + Datastar
          </p>
          <a
            href="/settings"
            class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <Icon icon="gear" aria-hidden="true" />
            Settings
          </a>
        </div>
        <h1
          class={cn(
            "text-5xl font-semibold tracking-tight",
            counterToneClass(tone),
          )}
        >
          Count: {count}
        </h1>
        <p class="text-muted-foreground">
          Server-rendered JSX, updated over a Datastar event stream.
        </p>
        <p class="text-muted-foreground/70 text-xs">
          {recentItems} items stored in the last {RECENT_ITEMS_WINDOW.hours}{" "}
          hours
        </p>
        <p class="text-muted-foreground/70 text-xs">
          Rendered at {Temporal.Now.instant().toString()}
        </p>
      </div>
      {/* Busy until the new count is on this tab's stream: past 200 ms the
          icon turns into a spinner (see ./components/busy), and a second
          click meanwhile is ignored. */}
      <button
        type="button"
        data-indicator={incrementing}
        data-on:click={`!$${incrementing} && ${post("/actions/increment")}`}
        data-attr:aria-busy={`$${incrementing} && 'true'`}
        class="bg-primary text-primary-foreground hover:bg-primary/90 flex w-fit items-center gap-2 rounded-full px-6 py-3 font-semibold transition"
      >
        <BusyIcon icon="plus" />
        Increment
      </button>
    </LivePage>
  );
}
