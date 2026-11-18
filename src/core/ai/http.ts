import { type FetchLike, AiError, isRetryableStatus, kindForStatus } from './types';

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
    const retryAfterMs = isRetryableStatus(response.status) ? retryDelay(response, data) : undefined;
    throw new AiError(kindForStatus(response.status), errorMessage(data) ?? `The provider answered with status ${response.status}.`, undefined, retryAfterMs);
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new AiError('server', 'The provider sent a reply that could not be read.');
  }
  return data as Record<string, unknown>;
}

/** Providers put the reason in different places. These cover the common ones. */
function errorMessage(data: unknown): string | null {
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
