/**
 * lib/agent/openai-client.ts
 * ---------------------------------------------------------------------------
 * OpenAI-compatible HTTP client construction and the dependency-injection
 * seam used to override client creation in tests.
 *
 * ── Why a DI seam? ──────────────────────────────────────────────────────
 * `runAgentLoop` and `createStreamingAgent` previously called the concrete
 * `createOpenAIClient()` directly. Tests had to monkey-patch the entire
 * module to substitute a fake client. By exporting `setOpenAIClientFactory`
 * we let tests inject a `FakeOpenAIClient` without touching globals.
 *
 * Production code reads `endpoint` + `api_key` from the SQLite settings
 * table; the Settings page lets users switch LLM endpoints at runtime
 * without restarting the server.
 */
import OpenAI from 'openai';
import { getSetting } from '../db';
import { lookupContextLength, getOutputLength } from '../model-lengths';
import type { ModelInfo } from './types';

/**
 * Minimal contract used by the agent loop. Production uses the real `openai`
 * SDK; tests can implement just `chat.completions.create` and `models.list`.
 */
export type OpenAIClient = OpenAI;

/**
 * A factory returns a configured OpenAI-compatible client. The default
 * factory reads endpoint + key from the SQLite settings table.
 */
export type OpenAIClientFactory = () => OpenAIClient;

/**
 * Trim whitespace from an API key or endpoint URL value.
 * Copy-paste whitespace around keys is a common source of silent auth failures.
 */
export function sanitizeKey(key: string): string {
  const trimmed = key.trim();
  // Reject masked display values (contain bullet characters U+2022)
  if (trimmed.includes('\u2022')) return 'sk-no-key';
  return trimmed;
}

const defaultFactory: OpenAIClientFactory = () => {
  const baseURL = getSetting('endpoint');
  const apiKey = sanitizeKey(getSetting('api_key') || 'sk-no-key');
  if (!baseURL) {
    // Caller is expected to have already gated on missing config and emitted
    // a friendly streamed error. Throwing here protects against silent calls
    // hitting a hardcoded vendor the operator never picked.
    throw new Error('No API endpoint is configured. Open Settings → Base URL and set one.');
  }
  return new OpenAI({ baseURL, apiKey });
};

let activeFactory: OpenAIClientFactory = defaultFactory;

/**
 * Replace the OpenAI client factory. Intended for tests only.
 *
 *   import { setOpenAIClientFactory } from '@/lib/agent/openai-client';
 *   setOpenAIClientFactory(() => fakeClient);
 *
 * Call `setOpenAIClientFactory(null)` (or `resetOpenAIClientFactory`) to
 * restore the default factory.
 */
export function setOpenAIClientFactory(factory: OpenAIClientFactory | null): void {
  activeFactory = factory ?? defaultFactory;
}

/**
 * Restore the default factory. Convenience alias for `setOpenAIClientFactory(null)`.
 */
export function resetOpenAIClientFactory(): void {
  activeFactory = defaultFactory;
}

/**
 * Create an OpenAI-compatible HTTP client using the active factory.
 */
export function createOpenAIClient(): OpenAIClient {
  return activeFactory();
}

// ── Model discovery ─────────────────────────────────────────────────────────

/**
 * Query the configured endpoint for available models.
 *
 * Used by the model selector dropdown in the Settings page.
 * Works with any OpenAI-compatible API because they all implement
 * GET /v1/models (OpenAI, Ollama, LM Studio, vLLM, Azure, Groq, etc.).
 */
export async function fetchAvailableModels(
  endpoint?: string,
  apiKey?: string,
): Promise<ModelInfo[]> {
  const resolvedEndpoint = endpoint || getSetting('endpoint');
  if (!resolvedEndpoint) {
    throw new Error('No API endpoint is configured. Open Settings → Base URL and set one.');
  }
  const openai =
    endpoint || apiKey
      ? new OpenAI({
          baseURL: resolvedEndpoint,
          apiKey: sanitizeKey(apiKey || getSetting('api_key') || 'sk-no-key'),
        })
      : createOpenAIClient();
  const list = await openai.models.list();
  return list.data
    .map((m) => {
      const meta = m as unknown as Record<string, unknown>;
      const fromProvider = meta.context_length as number | undefined;
      const outputFromProvider = (meta.max_output_tokens ?? meta.max_completion_tokens) as
        | number
        | undefined;
      return {
        id: m.id,
        context_length: fromProvider ?? lookupContextLength(m.id),
        max_output_tokens: outputFromProvider ?? getOutputLength(m.id),
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
