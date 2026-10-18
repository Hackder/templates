import { count as countRows, gte } from "drizzle-orm";
import { db } from "../db";
import { items } from "../schema";
import {
  cn,
  exhaustiveCheck,
  instantToDateForInteropWithDrizzle,
} from "../utils";
import { BusyIcon } from "./components/busy";

// The example page: a counter, and a database query bounded by a Temporal
// instant.

export const RECENT_ITEMS_WINDOW = Temporal.Duration.from({ hours: 24 });

// Timestamp columns are `Date` on the Drizzle side, so comparing them against a
// Temporal value needs the interop helper.
export async function countItemsSince(
  since: Temporal.Instant,
): Promise<number> {
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

interface CounterProps {
  count: number;
  recentItems: number;
}

export function Counter({ count, recentItems }: CounterProps) {
  const tone: CounterTone = count === 0 ? "idle" : "active";

  return (
    <main
      id="counter"
      class="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6"
    >
      <div class="space-y-3">
        <p class="tracking-eyebrow text-primary text-sm font-medium uppercase">
          Bun + Hono + Datastar
        </p>
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
      {/* Busy while its post is in flight: past 200 ms the icon turns into a
          spinner (see ./components/busy), and a second click is ignored
          instead of sending a stale count. */}
      <button
        type="button"
        data-indicator="_incrementing"
        data-on:click="!$_incrementing && @post('/increment')"
        data-attr:aria-busy="$_incrementing && 'true'"
        class="busy:cursor-progress bg-primary text-primary-foreground hover:bg-primary/90 flex w-fit items-center gap-2 rounded-full px-6 py-3 font-semibold transition"
      >
        <BusyIcon icon="plus" />
        Increment
      </button>
    </main>
  );
}
