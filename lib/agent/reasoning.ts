/**
 * lib/agent/reasoning.ts
 * ---------------------------------------------------------------------------
 * Two-level cache for "thinking" models' `reasoning_content`.
 *
 * "Thinking" models (DeepSeek R1, o1, etc.) emit a `reasoning_content` field
 * containing internal chain-of-thought text. We need to:
 *   1. Stream it to the browser ("g:" parts) so the user sees a thinking panel.
 *   2. Persist it between HTTP requests so the model can continue its reasoning
 *      on the next turn (the API requires echoing back the previous reasoning).
 *
 * Two-level cache:
 *   • In-memory Map  – fast; lives as long as the Node.js process.
 *   • SQLite setting – survives server restarts (key: "reasoning:<sessionId>").
 *
 * After a successful response, the previous reasoning is cleared so stale
 * thoughts don't pollute unrelated future turns.
 */
import { getSetting, setSetting } from '../db';

const reasoningCache = new Map<string, string>();

export function loadReasoning(sessionId: string): string {
  return reasoningCache.get(sessionId) || getSetting(`reasoning:${sessionId}`) || '';
}

export function saveReasoning(sessionId: string, text: string): void {
  reasoningCache.set(sessionId, text);
}

export function clearReasoning(sessionId: string): void {
  reasoningCache.delete(sessionId);
}

export function persistReasoning(sessionId: string): void {
  const text = reasoningCache.get(sessionId);
  setSetting(`reasoning:${sessionId}`, text ?? '');
}
