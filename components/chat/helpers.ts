/**
 * components/chat/helpers.ts
 * ---------------------------------------------------------------------------
 * Pure helper functions extracted from ChatInterface.tsx. Free of React or
 * DOM dependencies wherever possible — `getActionMenuPosition` is the lone
 * function that touches `window`, kept here for symmetry.
 */
import type { UIPart } from '@/components/MessageBubble';
import {
  ACTION_MENU_GAP,
  ACTION_MENU_HEIGHT,
  ACTION_MENU_MARGIN,
  ACTION_MENU_WIDTH,
} from './constants';
import type { Attachment, ExtendedMessage, IncompleteState, StoredMessage } from './types';

export function parseJsonArray<T>(raw: string | undefined): T[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

/** Convert a raw DB row from /api/messages into the shape useChat expects.
 *  The heavy parts_json string is intentionally NOT JSON.parsed here — it
 *  rides through as `parts_raw` so MessageRow can decode it lazily, only
 *  for rows that actually render. */
export function toExtendedMessage(m: StoredMessage): ExtendedMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    experimental_attachments: parseJsonArray<Attachment>(m.attachments_json),
    token_usage_json: m.token_usage_json || '{}',
    tool_calls_json: m.tool_calls_json || '[]',
    reasoning: m.reasoning_json || '',
    parts_raw: m.parts_json || '[]',
    trace_json: m.trace_json || '[]',
  };
}

export function getActionMenuPosition(rect: Pick<DOMRect, 'top' | 'bottom' | 'right'>) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left = Math.max(
    ACTION_MENU_MARGIN,
    Math.min(
      rect.right - ACTION_MENU_WIDTH,
      viewportWidth - ACTION_MENU_WIDTH - ACTION_MENU_MARGIN,
    ),
  );
  const below = rect.bottom + ACTION_MENU_GAP;
  const above = rect.top - ACTION_MENU_GAP - ACTION_MENU_HEIGHT;
  const top =
    below + ACTION_MENU_HEIGHT <= viewportHeight - ACTION_MENU_MARGIN
      ? below
      : Math.max(ACTION_MENU_MARGIN, above);
  return { x: left, y: top };
}

/**
 * Detect whether an assistant message ended in an incomplete state (max
 * output tokens, dropped connection, upstream error). Sources, in order:
 *
 *   1. Persisted parts (`incomplete-marker`) — restored from DB on reload.
 *   2. Live `data[]` events (`type: 'incomplete'`) — emitted by the server
 *      mid-stream when interrupt detection triggers.
 *   3. Fallback: scan the message text for the well-known ⚠️ warning
 *      strings the server agent loop emits.
 *
 * We only honor the marker on the LAST assistant message AND when the
 * stream is no longer running (otherwise the Continue button would race
 * with the in-progress completion).
 */
export function detectIncomplete(
  isLast: boolean,
  role: 'user' | 'assistant',
  isStreaming: boolean,
  parts: UIPart[] | undefined,
  data: unknown[] | undefined,
  content: string,
): IncompleteState | undefined {
  if (!isLast || role !== 'assistant' || isStreaming) return undefined;
  const partsList = parts ?? [];
  for (const p of partsList) {
    if (p && typeof p === 'object' && (p as Record<string, unknown>).type === 'incomplete-marker') {
      const rec = p as Record<string, unknown>;
      const rawReason = String(rec.reason ?? 'error');
      const reason: IncompleteState['reason'] =
        rawReason === 'length' || rawReason === 'connection_lost' ? rawReason : 'error';
      return { reason, detail: typeof rec.detail === 'string' ? rec.detail : undefined };
    }
  }
  const live = (data ?? []).find(
    (d) =>
      typeof d === 'object' && d !== null && (d as Record<string, unknown>).type === 'incomplete',
  ) as Record<string, unknown> | undefined;
  if (live) {
    const rawReason = String(live.reason ?? 'error');
    const reason: IncompleteState['reason'] =
      rawReason === 'length' || rawReason === 'connection_lost' ? rawReason : 'error';
    return { reason, detail: typeof live.detail === 'string' ? live.detail : undefined };
  }
  const textParts = partsList
    .filter((p) => p && typeof p === 'object' && (p as Record<string, unknown>).type === 'text')
    .map((p) => String((p as Record<string, unknown>).text ?? ''));
  const warningText = [content, ...textParts].filter(Boolean).join('\n\n');
  if (/^>\s*⚠️/m.test(warningText)) {
    if (warningText.includes('maximum output token limit')) return { reason: 'length' };
    if (warningText.includes('connection to the model dropped'))
      return { reason: 'connection_lost' };
    if (warningText.includes('interrupted')) return { reason: 'error' };
  }
  return undefined;
}
