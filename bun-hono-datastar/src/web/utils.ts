import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Temporal } from "temporal-polyfill";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Drizzle's `timestamp` columns are typed as `Date`, so this is the single
// intended place where a Temporal value crosses back into the legacy API.
export function instantToDateForInteropWithDrizzle(
  instant: Temporal.Instant,
): Date {
  // eslint-disable-next-line no-restricted-syntax
  return new Date(instant.epochMilliseconds);
}

export function exhaustiveCheck(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}
