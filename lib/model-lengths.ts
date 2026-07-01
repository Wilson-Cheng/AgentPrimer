export const DEFAULT_OUTPUT_LENGTH = 16_000;

export const KNOWN_CONTEXT_LENGTHS: [string, number][] = [
  ['deepseek-v4-flash', 1_048_576],
  ['deepseek-v4-pro', 1_048_576],
  ['deepseek-r1', 163_840],
  ['deepseek-chat', 65_536],
  ['deepseek-reasoner', 65_536],
  ['gpt-5-pro', 400_000],
  ['gpt-5.1', 400_000],
  ['gpt-5', 400_000],
  ['gpt-4o', 128_000],
  ['gpt-4-turbo', 128_000],
  ['gpt-4', 8_192],
  ['gpt-3.5-turbo-16k', 16_385],
  ['gpt-3.5-turbo', 16_385],
  ['o1-preview', 128_000],
  ['o1-mini', 128_000],
  ['o3', 200_000],
  ['o4-mini', 200_000],
  ['claude-mythos-preview', 1_000_000],
  ['claude-opus-4-7', 1_000_000],
  ['claude-opus-4-6', 1_000_000],
  ['claude-sonnet-4-6', 1_000_000],
  ['claude-opus-4-5', 200_000],
  ['claude-sonnet-4-5', 200_000],
  ['claude-haiku-4-5', 200_000],
  ['claude-opus-4-1', 200_000],
  ['claude-opus-4', 200_000],
  ['claude-sonnet-4', 200_000],
  ['claude-3-5-sonnet', 200_000],
  ['claude-3-5-haiku', 200_000],
  ['claude-3-opus', 200_000],
  ['claude-3-sonnet', 200_000],
  ['claude-3-haiku', 200_000],
  ['glm-5.2', 200_000],
  ['glm-5.1', 200_000],
  ['glm-4.7', 200_000],
  ['glm-4.6', 200_000],
  ['glm-4.5', 128_000],
  ['glm-4', 128_000],
  ['kimi-k2.7', 262_144],
  ['kimi-k2.6', 256_000],
  ['kimi-k2.5', 256_000],
  ['kimi-k2-thinking', 256_000],
  ['kimi-k2-turbo', 256_000],
  ['kimi-k2', 128_000],
  ['moonshot-v1-128k', 128_000],
  ['moonshot-v1-32k', 32_000],
  ['moonshot-v1-8k', 8_000],
  ['minimax-m3', 1_048_576],
  ['minimax-m2.7', 192_000],
  ['minimax-m2.5', 192_000],
  ['minimax-m2', 192_000],
  ['minimax-m1', 1_000_000],
  ['llama-3.3-70b', 131_072],
  ['llama-3.1-70b', 131_072],
  ['llama-3.1-8b', 131_072],
  ['llama3-70b', 8_192],
  ['llama3-8b', 8_192],
  ['mixtral-8x7b', 32_768],
  ['gemma2-9b', 8_192],
  ['gemini-3.5-flash', 1_048_576],
  ['gemini-3.1-pro', 1_048_576],
  ['gemini-3.1-flash-lite', 1_048_576],
  ['gemini-3-flash', 1_048_576],
  ['gemini-2.5-pro', 1_048_576],
  ['gemini-2.5-flash', 1_048_576],
  ['gemini-2.5-flash-lite', 1_048_576],
  ['gemini-2.0-flash', 1_048_576],
  ['gemini-1.5-pro', 2_097_152],
  ['gemini-1.5-flash', 1_048_576],
  ['mistral-large', 131_072],
  ['mistral-small', 131_072],
  ['mistral-nemo', 131_072],
  ['codestral', 256_000],
];

export const KNOWN_OUTPUT_LENGTHS: [string, number][] = [
  // --- DeepSeek (V4 Next-Gen Ultra-Long Output) ---
  ['deepseek-v4-flash', 393_216], // 384k native output support via CSA architecture
  ['deepseek-v4-pro', 393_216], // 384k native max completion tokens
  ['deepseek-r1', 65_536],
  ['deepseek-chat', 8_192],
  ['deepseek-reasoner', 64_000],

  // --- OpenAI GPT Series ---
  ['gpt-5-pro', 128_000],
  ['gpt-5.1', 128_000],
  ['gpt-5', 128_000],
  ['gpt-4o', 16_384],
  ['gpt-4-turbo', 4_096],
  ['gpt-4', 4_096],
  ['gpt-3.5-turbo-16k', 4_096],
  ['gpt-3.5-turbo', 4_096],

  // --- OpenAI Reasoning (o-series) ---
  ['o1-preview', 32_768],
  ['o1-mini', 65_536],
  ['o3', 100_000],
  ['o4-mini', 65_536],

  // --- Anthropic Claude (v4 Frontier 128k Generation Windows) ---
  ['claude-mythos-preview', 128_000],
  ['claude-opus-4-7', 128_000], // Up to 128k max output tokens natively supported
  ['claude-opus-4-6', 128_000],
  ['claude-sonnet-4-6', 128_000],
  ['claude-opus-4-5', 128_000],
  ['claude-sonnet-4-5', 128_000],
  ['claude-haiku-4-5', 32_768], // High-speed tier capped at 32k
  ['claude-opus-4-1', 16_384],
  ['claude-opus-4', 16_384],
  ['claude-sonnet-4', 16_384],
  ['claude-3-5-sonnet', 8_192],
  ['claude-3-5-haiku', 8_192],
  ['claude-3-opus', 4_096],
  ['claude-3-sonnet', 4_096],
  ['claude-3-haiku', 4_096],

  // --- GLM (Zhipu AI Long-Horizon Agent Tier) ---
  ['glm-5.2', 131_072],
  ['glm-5.1', 131_072],
  ['glm-4.7', 131_072],
  ['glm-4.6', 8_192],
  ['glm-4.5', 8_192],
  ['glm-4', 4_096],

  // --- Kimi (Moonshot AI K2 Architecture with Native Reasoning) ---
  ['kimi-k2.7', 32_768], // Native 32k max output window (e.g., kimi-k2.7-code)
  ['kimi-k2.6', 32_768],
  ['kimi-k2.5', 32_768],
  ['kimi-k2-thinking', 65_536], // Expanded ceiling when high-effort reasoning is enforced
  ['kimi-k2-turbo', 32_768],
  ['kimi-k2', 8_192],

  // --- Moonshot Legacy ---
  ['moonshot-v1-128k', 8_192],
  ['moonshot-v1-32k', 8_192],
  ['moonshot-v1-8k', 8_192],

  // --- MiniMax (Ultra-Long Generation) ---
  ['minimax-m3', 131_072], // 128k max completion via Sparse Attention
  ['minimax-m2.7', 131_072],
  ['minimax-m2.5', 8_192],
  ['minimax-m2', 8_192],
  ['minimax-m1', 4_096],

  // --- Meta Llama Series ---
  ['llama-3.3-70b', 8_192],
  ['llama-3.1-70b', 8_192],
  ['llama-3.1-8b', 8_192],
  ['llama3-70b', 2_048],
  ['llama3-8b', 2_048],

  // --- Open Source Models ---
  ['mixtral-8x7b', 4_096],
  ['gemma2-9b', 8_192],

  // --- Google Gemini ---
  ['gemini-3.5-flash', 16_384],
  ['gemini-3.1-pro', 16_384],
  ['gemini-3.1-flash-lite', 8_192],
  ['gemini-3-flash', 16_384],
  ['gemini-2.5-pro', 16_384],
  ['gemini-2.5-flash', 16_384],
  ['gemini-2.5-flash-lite', 8_192],
  ['gemini-2.0-flash', 8_192],
  ['gemini-1.5-pro', 8_192],
  ['gemini-1.5-flash', 8_192],

  // --- Mistral AI ---
  ['mistral-large', 8_192],
  ['mistral-small', 8_192],
  ['mistral-nemo', 8_192],
  ['codestral', 8_192],
];

export function lookupContextLength(modelId: string): number | undefined {
  const id = modelId.toLowerCase();
  for (const [prefix, size] of KNOWN_CONTEXT_LENGTHS) {
    if (id.startsWith(prefix.toLowerCase())) return size;
  }
  return undefined;
}

export function lookupOutputLength(modelId: string): number | undefined {
  const id = modelId.toLowerCase();
  for (const [prefix, size] of KNOWN_OUTPUT_LENGTHS) {
    if (id.startsWith(prefix.toLowerCase())) return size;
  }
  return undefined;
}

export function getContextLength(
  modelId: string,
  fetched?: Record<string, number>,
): number | undefined {
  if (fetched?.[modelId]) return fetched[modelId];
  return lookupContextLength(modelId);
}

export function getOutputLength(modelId: string, fetched?: Record<string, number>): number {
  if (fetched?.[modelId]) return fetched[modelId];
  return lookupOutputLength(modelId) ?? DEFAULT_OUTPUT_LENGTH;
}
