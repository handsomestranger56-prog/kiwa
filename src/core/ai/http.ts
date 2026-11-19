import { type FetchLike, type RateLimit, AiError, isRetryableStatus, kindForStatus } from './types';

/** Sends JSON and reads JSON back, turning every failure into an AiError. */
export async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown },
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: init.method ?? 'GET',
      headers: { ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch (error) {
    throw new AiError('network', error instanceof Error ? error.message : String(error));
  }

  const text = await response.text().catch(() => '');
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const limit = rateLimitOf(response.status, data);
    // A daily limit or used-up credit will not clear in a minute, so it is not worth retrying.
    const retryAfterMs = isRetryableStatus(response.status) && limit !== 'day' && limit !== 'quota' ? retryDelay(response, data) : undefined;
    throw new AiError(kindForStatus(response.status), errorMessage(data) ?? `The provider answered with status ${response.status}.`, undefined, retryAfterMs, limit);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AiError('server', 'The provider sent a reply that could not be read.');
  }
  return data as Record<string, unknown>;
}

/**
 * Which limit a 429 or 402 hit. Google names it in QuotaFailure (a quotaId such as
 * "GenerateRequestsPerDayPerProjectPerModel-FreeTier"); OpenAI-style services say it in the
 * message ("requests per day (RPD)") or with the code "insufficient_quota".
 */
export function rateLimitOf(status: number, data: unknown): RateLimit | undefined {
  if (status === 402) return 'quota';
  if (status !== 429) return undefined;
  const error = (data as { error?: { code?: unknown; type?: unknown; details?: { violations?: { quotaId?: unknown; quotaMetric?: unknown }[] }[] } } | null)?.error;
  if (error?.code === 'insufficient_quota' || error?.type === 'insufficient_quota') return 'quota';
  const ids = (error?.details ?? []).flatMap((detail) => detail?.violations ?? []).map((violation) => `${violation?.quotaId ?? ''} ${violation?.quotaMetric ?? ''}`);
  const text = `${ids.join(' ')} ${errorMessage(data) ?? ''}`.toLowerCase();
  if (/perday|per day|\(rpd\)|daily/.test(text)) return 'day';
  if (/perminute|per minute|per min\b|\(rpm\)|\(tpm\)/.test(text)) return 'minute';
  if (/exceeded your current quota|billing|credit balance|insufficient/.test(text)) return 'quota';
  return undefined;
}

/** Providers put the reason in different places. These cover the common ones. */
export function errorMessage(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const error = (data as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  const message = (data as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

/**
 * How long the provider asked to wait, in milliseconds, or 0 when it did not say. Read from the
 * Retry-After header, or from Google's RetryInfo detail ("retryDelay": "37s") in the error body.
 */
export function retryDelay(response: Pick<Response, 'headers'>, data: unknown): number {
  const header = response.headers?.get?.('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const at = Date.parse(header);
    if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  }
  const details = (data as { error?: { details?: { retryDelay?: unknown }[] } } | null)?.error?.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      const match = typeof detail?.retryDelay === 'string' ? /^(\d+(?:\.\d+)?)s$/.exec(detail.retryDelay) : null;
      if (match) return Math.round(Number(match[1]) * 1000);
    }
  }
  return 0;
}

export function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}
