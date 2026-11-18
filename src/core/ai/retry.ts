import { AiError } from './types';

/** Attempts after the first one, for a single request. */
export const MAX_RETRIES = 3;

/** Longer waits than this mean a daily quota or a long outage: better to stop and say so. */
export const MAX_WAIT_MS = 90_000;

/** Used when the provider does not say how long to wait. */
const BACKOFF_MS = [15_000, 30_000, 60_000];

/**
 * How long to wait before sending the same request again, or null to give up.
 * Only rate limits and busy servers are retried: a wrong key or a bad request will not improve.
 */
export function retryWait(error: unknown, attempt: number): number | null {
  if (!(error instanceof AiError) || error.retryAfterMs === undefined) return null;
  if (error.limit === 'day' || error.limit === 'quota') return null;
  if (attempt >= MAX_RETRIES) return null;
  // A second of margin: limits are counted on the provider's clock, not this phone's.
  const wait = error.retryAfterMs > 0 ? error.retryAfterMs + 1000 : BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  return wait <= MAX_WAIT_MS ? wait : null;
}
