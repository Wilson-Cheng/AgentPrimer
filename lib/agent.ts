/**
 * lib/agent.ts
 * ---------------------------------------------------------------------------
 * Backwards-compatible barrel for the agent module.
 *
 * Implementation now lives in lib/agent/*.ts:
 *
 *   lib/agent/types.ts           — shared types
 *   lib/agent/openai-client.ts   — client factory + DI seam (setOpenAIClientFactory)
 *   lib/agent/schema.ts          — Zod → OpenAI JSON Schema
 *   lib/agent/sanitize.ts        — wire-payload sanitizers + JSON helpers
 *   lib/agent/usage.ts           — provider-agnostic token-usage normalizer
 *   lib/agent/stream.ts          — chunk normalization, finish-reason mapping,
 *                                  <think> extractor, incomplete-notice text
 *   lib/agent/reasoning.ts       — two-level reasoning cache
 *   lib/agent/messages.ts        — useChat → OpenAI, sliding-window compaction,
 *                                  multimodal attachment helpers
 *   lib/agent/finalize.ts        — post-loop structured-output finalize call
 *   lib/agent/prompt.ts          — system-prompt composition
 *   lib/agent/model-resolver.ts  — agent-pinned model validation + fallback
 *   lib/agent/builtin-tools.ts   — createBuiltinTools + async sub-agent runner
 *   lib/agent/loop.ts            — runAgentLoop (the ReAct loop)
 *   lib/agent/streaming-agent.ts — createStreamingAgent (public entry point)
 *
 * Re-exporting through `lib/agent/index.ts` keeps every existing import path
 * (`@/lib/agent`, `./agent`, etc.) working unchanged.
 */
export * from './agent/index';
