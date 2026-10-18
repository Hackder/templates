// Failed-login throttling, in memory. Each key (a client IP, or one shared
// key for every attempt) gets a few free failures; after that each further
// failure doubles the wait before the next attempt, up to a cap. A key is
// forgotten once it has been quiet for `forgetAfter`, or when a login from it
// succeeds.
//
// Attempts are counted before the password is checked (`recordAttempt`), not
// after: verifying takes tens of milliseconds, and a burst of parallel
// guesses must not all pass the check while the first is still verifying.

export interface LimiterPolicy {
  freeAttempts: number;
  baseDelay: Temporal.Duration;
  maxDelay: Temporal.Duration;
  forgetAfter: Temporal.Duration;
}

interface Strikes {
  attempts: number;
  lastAttemptAt: Temporal.Instant;
}

export interface Limiter {
  policy: LimiterPolicy;
  strikes: Map<string, Strikes>;
}

export function createLimiter(policy: LimiterPolicy): Limiter {
  return { policy, strikes: new Map() };
}

/** How long `attempts` failures make the next attempt wait. */
function delayAfter(
  policy: LimiterPolicy,
  attempts: number,
): Temporal.Duration {
  const over = attempts - policy.freeAttempts;
  if (over < 0) {
    return Temporal.Duration.from({ seconds: 0 });
  }
  const ms = Math.min(
    policy.baseDelay.total("milliseconds") * 2 ** over,
    policy.maxDelay.total("milliseconds"),
  );
  return Temporal.Duration.from({ milliseconds: Math.round(ms) });
}

function forgetQuiet(limiter: Limiter, now: Temporal.Instant): void {
  for (const [key, strikes] of limiter.strikes) {
    const quietUntil = strikes.lastAttemptAt.add(limiter.policy.forgetAfter);
    if (Temporal.Instant.compare(now, quietUntil) >= 0) {
      limiter.strikes.delete(key);
    }
  }
}

/**
 * How long `key` must still wait before it may try again; null when it may
 * try now.
 */
export function retryAfter(
  limiter: Limiter,
  key: string,
  now: Temporal.Instant,
): Temporal.Duration | null {
  forgetQuiet(limiter, now);
  const strikes = limiter.strikes.get(key);
  if (strikes === undefined) {
    return null;
  }
  const allowedAt = strikes.lastAttemptAt.add(
    delayAfter(limiter.policy, strikes.attempts),
  );
  if (Temporal.Instant.compare(now, allowedAt) >= 0) {
    return null;
  }
  return now.until(allowedAt);
}

/** Counts an attempt as a failure until `recordSuccess` says otherwise. */
export function recordAttempt(
  limiter: Limiter,
  key: string,
  now: Temporal.Instant,
): void {
  const attempts = (limiter.strikes.get(key)?.attempts ?? 0) + 1;
  limiter.strikes.set(key, { attempts, lastAttemptAt: now });
}

export function recordSuccess(limiter: Limiter, key: string): void {
  limiter.strikes.delete(key);
}
