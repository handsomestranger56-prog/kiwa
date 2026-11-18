export type ProviderKind = 'claude' | 'gemini' | 'openai';
export const PROVIDER_KINDS = ['claude', 'gemini', 'openai'] as const satisfies readonly ProviderKind[];

/** What is needed to talk to one provider. The key comes from the device's secure store. */
export type Connection = { kind: ProviderKind; apiKey: string; baseUrl?: string };

export type ModelInfo = { id: string; label: string };

export type GenerateRequest = {
  model: string;
  system?: string;
  prompt: string;
  /** When set, the reply must be JSON. Providers that can enforce a schema are given this one. */
  schema?: Record<string, unknown>;
  maxTokens?: number;
};

export type Usage = { inputTokens: number; outputTokens: number };

export type GenerateResult = { text: string; usage: Usage };

export type AiErrorKind =
  /** The key was refused. */
  | 'auth'
  /** Too many requests or no credit left. */
  | 'rate'
  /** The model or address does not exist. */
  | 'notFound'
  /** The provider rejected the request itself. */
  | 'badRequest'
  /** The model declined to answer. */
  | 'refusal'
  /** The reply was cut off at the length limit. */
  | 'length'
  /** No connection, or the provider did not answer in time. */
  | 'network'
  /** The provider had a problem on its side. */
  | 'server';

export type RateLimit = 'minute' | 'day' | 'quota';

export class AiError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    message: string,
    /** Tokens already spent when the error happened, if the provider said. */
    public readonly usage?: Usage,
    /**
     * Set when the same request may succeed later: a rate limit or a busy server. Holds how long
     * the provider asked to wait, in milliseconds, or 0 when it did not say.
     */
    public readonly retryAfterMs?: number,
    /** Which limit a rate error hit, when the provider said: per minute, per day, or credit used up. */
    public readonly limit?: RateLimit,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

export type FetchLike = typeof fetch;

/** The operations every provider supports. */
export type Adapter = {
  listModels(connection: Connection, fetchImpl: FetchLike): Promise<ModelInfo[]>;
  generate(connection: Connection, request: GenerateRequest, fetchImpl: FetchLike): Promise<GenerateResult>;
};

/** Maps an HTTP status to the kind of problem it means. */
export function kindForStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notFound';
  if (status === 402 || status === 429) return 'rate';
  if (status >= 500) return 'server';
  return 'badRequest';
}

/** Statuses worth trying again after a pause: too many requests, or a busy or failing server. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529;
}

export const DEFAULT_MAX_TOKENS = 16000;
