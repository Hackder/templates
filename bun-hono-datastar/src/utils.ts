import assert from "node:assert/strict";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export class Semaphore {
  private permits: number;
  private waiters: (() => void)[];

  constructor(permits: number) {
    this.permits = permits;
    this.waiters = [];
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        // This callback runs only from release(), which incremented `permits`
        // immediately before shifting it off the queue.
        assert(this.permits > 0, "Semaphore waiter woken without a permit");
        this.permits--;
        resolve();
      });
    });
  }

  release(): void {
    this.permits++;
    const next = this.waiters.shift();
    if (next !== undefined) {
      next();
    }
  }
}

export type FetchFunction = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export function createLimitedFetch({
  concurrency,
  rps,
  fetchFn = globalThis.fetch,
}: {
  concurrency: number;
  rps: number;
  fetchFn?: FetchFunction;
}): FetchFunction {
  const semaphore = new Semaphore(concurrency);

  const windowMs = 1000;
  const maxPerWindow = rps;
  const starts: number[] = [];

  // Wait until starting would not exceed rps in the last 1000ms
  async function awaitRateSlot() {
    // Loop because multiple waiters may wake at once
    for (;;) {
      // oxlint-disable-next-line local/no-date -- wall-clock epoch ms is fine for a rate window, and tests drive this with fake Date timers
      const now = Date.now();
      // Drop old timestamps
      while (starts[0] !== undefined && now - starts[0] >= windowMs) {
        starts.shift();
      }

      if (starts.length < maxPerWindow) {
        starts.push(now);
        return;
      }

      // We get here only when `starts.length >= maxPerWindow`, and every caller
      // should pass a positive rps, so the window holds at least one timestamp.
      assert(starts[0] !== undefined, "Rate limiter window is full but empty");

      const wait = windowMs - (now - starts[0]);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return async function limitedFetch(input, init): Promise<Response> {
    await semaphore.acquire();
    try {
      await awaitRateSlot();
      return await fetchFn(input, init);
    } finally {
      semaphore.release();
    }
  };
}

/**
 * Removes diacritics/combining marks
 */
export function unaccent(str: string): string {
  return str.normalize("NFD").replace(/\p{M}+/gu, "");
}

export function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

// Drizzle's `timestamp` columns are typed as `Date`, so this is the single
// intended place where a Temporal value crosses back into the legacy API.
export function instantToDateForInteropWithDrizzle(
  instant: Temporal.Instant,
): Date {
  // oxlint-disable-next-line local/no-date
  return new Date(instant.epochMilliseconds);
}
