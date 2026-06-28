/**
 * components/chat/types.ts
 * ---------------------------------------------------------------------------
 * Shared types used across the chat UI surface (extracted from the original
 * monolithic ChatInterface.tsx).
 */
import type { JSONValue } from 'ai';
import type { PreviewFile } from '@/components/PreviewPanel';
import type { UIPart } from '@/components/MessageBubble';

export interface Attachment {
  name: string;
  url: string;
  mime: string;
  size: number;
}

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments_json: string;
  tool_calls_json: string;
  token_usage_json: string;
  reasoning_json?: string;
  parts_json?: string;
  trace_json?: string;
  /** Internal SQLite rowid used as the pagination cursor. 0 for synthetic
   *  rows (sub-agent notifications) that have no underlying DB row. */
  _rowid?: number;
}

export interface MessagesPage {
  messages: StoredMessage[];
  totalCount: number;
  nextCursor: number | null;
  hasMore: boolean;
}

export interface PreviewState {
  open: boolean;
  file: PreviewFile | null;
  history: PreviewFile[];
  index: number;
}

// ---------------------------------------------------------------------------
// ExtendedMessage – useChat Message augmented with our custom persisted fields
// ---------------------------------------------------------------------------
export type ExtendedMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls_json?: string;
  trace_json?: string;
  token_usage_json?: string;
  reasoning?: string;
  experimental_attachments?: Attachment[];
  parts?: UIPart[];
  /** Raw `parts_json` string for historical messages. Kept un-parsed at the
   *  list level so a 200-tool-call session doesn't pay JSON.parse + object
   *  allocation cost for every row up front. MessageRow parses on first
   *  render. Live messages (still streaming via useChat) get `parts` from
   *  the SDK directly and leave this empty. */
  parts_raw?: string;
  /** Mirror of `Message['data']` from the AI SDK. Typed as `JSONValue[]`
   *  rather than `unknown[]` so this superset assigns into `Message[]` at
   *  the `setMessages` boundary without an unsafe cast. The few code paths
   *  that push richer objects (finalize_call, structured_output, …) all
   *  cast through `unknown` already, so the runtime shape is unchanged. */
  data?: JSONValue[];
};

// ---------------------------------------------------------------------------
// IncompleteState – metadata describing a partial assistant response.
// `reason` mirrors the values written into `incomplete-marker` parts by the
// server agent loop in lib/agent/loop.ts.
// ---------------------------------------------------------------------------
export type IncompleteState = {
  reason: 'length' | 'connection_lost' | 'error';
  detail?: string;
};

export interface Props {
  initialSessionId?: string;
}
