import { claudeAdapter } from './claude';
import { geminiAdapter } from './gemini';
import { openaiAdapter } from './openai';
import type { Adapter, Connection, FetchLike, GenerateRequest, GenerateResult, ModelInfo, ProviderKind } from './types';

export * from './types';
export { strictSchema } from './schema';
export { CATALOG_UPDATED, MODEL_GROUPS, canDo, groupModels, profileOf } from './catalog';
export type { ModelGroup, ModelProfile, ModelStatus, ModelTask, ModelTier } from './catalog';
export { MAX_RETRIES, MAX_WAIT_MS, retryWait } from './retry';
export { GEMINI_BASE_URL } from './gemini';
export { OPENAI_BASE_URL, OPENAI_COMPATIBLE_PRESETS } from './openai';

const adapters: Record<ProviderKind, Adapter> = { claude: claudeAdapter, gemini: geminiAdapter, openai: openaiAdapter };

export function listModels(connection: Connection, fetchImpl: FetchLike = fetch): Promise<ModelInfo[]> {
  return adapters[connection.kind].listModels(connection, fetchImpl);
}

export function generate(connection: Connection, request: GenerateRequest, fetchImpl: FetchLike = fetch): Promise<GenerateResult> {
  return adapters[connection.kind].generate(connection, request, fetchImpl);
}
