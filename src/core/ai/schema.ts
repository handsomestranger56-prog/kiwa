/**
 * Turns a JSON Schema produced from the app's Zod schemas into one that providers with strict
 * structured output accept: no length, size or pattern limits, no defaults, `anyOf` instead of
 * `oneOf`, and every object closed with `additionalProperties: false`.
 * The full rules are still checked when the reply is imported, so nothing is lost.
 */
export function strictSchema(schema: Record<string, unknown>): Record<string, unknown> {
  return clean(schema) as Record<string, unknown>;
}

const DROPPED = new Set([
  '$schema',
  'default',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minItems',
  'maxItems',
  'uniqueItems',
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (typeof node !== 'object' || node === null) return node;

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROPPED.has(key)) continue;
    result[key === 'oneOf' ? 'anyOf' : key] = clean(value);
  }
  if (result.type === 'object' || typeof result.properties === 'object') {
    result.additionalProperties = false;
  }
  return result;
}
