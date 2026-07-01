/**
 * components/message/types.ts
 * ---------------------------------------------------------------------------
 * Shared TypeScript interfaces for the MessageBubble component family.
 *
 * Re-exported from ../MessageBubble.tsx so existing imports continue to work:
 *   import type { AgentFileResult, LiveToolInvocation, UIPart, ApprovalRequest }
 *     from '@/components/MessageBubble';
 */

export interface Attachment {
  name: string;
  url: string;
  mime: string;
  size: number;
}

/** Shape of the agent_file tool result (must match lib/agent-files.ts) */
export interface AgentFileResult {
  type: 'agent_file';
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  url: string;
  description?: string;
}

export interface ToolCall {
  toolName: string;
  args: unknown;
  result?: unknown;
}

/** Shape of tool-invocation parts streamed by useChat (ai@4.x) */
export interface LiveToolInvocation {
  toolCallId: string;
  toolName: string;
  args: unknown;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

/**
 * Typed parts from useChat's message.parts array (Vercel AI SDK 4.x).
 * The SDK emits them in temporal order, enabling interleaved rendering.
 */
export type UIPart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; reasoning: string; details?: unknown[] }
  | { type: 'tool-invocation'; toolInvocation: LiveToolInvocation }
  | { type: 'step-start' }
  | { type: string };

export interface ApprovalRequest {
  requires_approval: true;
  operation: 'delete' | 'read_dotfile';
  path: string;
  description: string;
}

/** Per-step trace data from the agent loop (enables the "Show trace" button) */
export type AgentStepTrace = {
  step_index: number;
  duration_ms: number;
  finish_reason: string;
  request?: { model: string; messages: unknown; tools?: unknown };
  token_usage: { input: number; cached: number; output: number };
  tool_calls: Array<{ toolCallId: string; toolName: string; args: unknown; result: unknown }>;
};

/** Token usage summary attached to a single message. */
export interface MessageTokenUsage {
  input: number;
  cached: number;
  output: number;
  source?: unknown;
}
