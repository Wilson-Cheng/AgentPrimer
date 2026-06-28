/**
 * lib/agent/usage.ts
 * ---------------------------------------------------------------------------
 * Token-usage normalization. Different OpenAI-compatible providers report
 * usage under different field names (`prompt_tokens`, `inputTokens`,
 * `promptTokenCount`, etc.). This module flattens all of them into a single
 * `TokenUsage` shape.
 */
import type { TokenUsage } from './types';
import { toJSONValue } from './sanitize';

function numberFromPath(value: unknown, path: string[]): number | undefined {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'number' && Number.isFinite(current) ? current : undefined;
}

function firstNumber(value: unknown, paths: string[][]): number {
  for (const path of paths) {
    const found = numberFromPath(value, path);
    if (found != null) return found;
  }
  return 0;
}

export function normalizeTokenUsage(source: unknown): TokenUsage {
  const input = firstNumber(source, [
    ['prompt_tokens'],
    ['input_tokens'],
    ['inputTokens'],
    ['promptTokens'],
    ['promptTokenCount'],
    ['usageMetadata', 'promptTokenCount'],
    ['usage', 'input_tokens'],
    ['usage', 'prompt_tokens'],
  ]);
  const output = firstNumber(source, [
    ['completion_tokens'],
    ['output_tokens'],
    ['outputTokens'],
    ['completionTokens'],
    ['candidatesTokenCount'],
    ['generationTokenCount'],
    ['usageMetadata', 'candidatesTokenCount'],
    ['usageMetadata', 'generationTokenCount'],
    ['usage', 'output_tokens'],
    ['usage', 'completion_tokens'],
  ]);
  const cached = firstNumber(source, [
    ['prompt_cache_hit_tokens'],
    ['prompt_cache_read_tokens'],
    ['cached_tokens'],
    ['cachedTokens'],
    ['cache_read_input_tokens'],
    ['cachedContentTokenCount'],
    ['usageMetadata', 'cachedContentTokenCount'],
    ['input_token_details', 'cache_read'],
    ['input_token_details', 'cached_tokens'],
    ['prompt_tokens_details', 'cached_tokens'],
    ['usage', 'prompt_cache_hit_tokens'],
    ['usage', 'prompt_cache_read_tokens'],
    ['usage', 'input_token_details', 'cache_read'],
    ['cacheReadInputTokens'],
    ['usageMetadata', 'cacheTokensDetails'],
    ['usage', 'prompt_tokens_details', 'cached_tokens'],
  ]);
  return { input, cached, output, source: toJSONValue(source ?? {}) };
}
