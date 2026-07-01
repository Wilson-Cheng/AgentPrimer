'use client';

/**
 * components/message/FinalizeCallBubble.tsx
 * ---------------------------------------------------------------------------
 * Expandable bubble showing the raw request payload that was sent in the
 * finalize call for structured-output agents.
 *
 * Two flavours of the same bubble depending on what came before:
 *
 *   • One-shot path  — schema agent with no tools/skills (e.g. `extractor`).
 *     No ReAct loop runs because there's nothing to loop over; the finalize
 *     call IS the entire response. Header reads "Single JSON call".
 *
 *   • Hybrid path    — schema agent with tools (e.g. `extractor-with-tools`).
 *     The ReAct loop runs first (tool cards + free-form reasoning), then
 *     the finalize call converts the transcript. Header reads "Finalizing
 *     loop output as JSON".
 *
 * The bubble is intentionally pre-call only: the user sees what's about
 * to be sent BEFORE the model responds. The response panel appears below
 * as a structured-output panel (StructuredOutputPanel).
 */

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import JsonView from '../ui/JsonView';

interface PayloadMessage {
  role?: string;
  // other fields ignored — we only care about `role`
}

export default function FinalizeCallBubble({
  schemaLabel,
  payload,
}: {
  schemaLabel?: string;
  payload: unknown;
}) {
  const [expanded, setExpanded] = useState(false);

  // Detect "one-shot" vs "post-loop" by inspecting the messages array in
  // the request payload. The finalize transcript always ends with one
  // trailing `user` message (the finalize instruction). If the only
  // non-system, non-trailing-finalize messages are user turns — i.e. no
  // `assistant` or `tool` messages — then no loop ran.
  const oneShot = useMemo(() => {
    if (!payload || typeof payload !== 'object') return false;
    const msgs = (payload as { messages?: PayloadMessage[] }).messages;
    if (!Array.isArray(msgs)) return false;
    // Drop system messages (index 0 plus any other) and the trailing
    // finalize user message — what's left is the actual "conversation" we
    // care about.
    const conversation = msgs.slice(0, -1).filter((m) => m.role !== 'system');
    return !conversation.some((m) => m.role === 'assistant' || m.role === 'tool');
  }, [payload]);

  const headerText = oneShot
    ? `Single JSON call · ${schemaLabel ?? 'structured output'}`
    : `Finalizing loop output as JSON · ${schemaLabel ?? 'structured output'}`;

  return (
    <div className="w-full min-w-0 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/30 overflow-hidden text-sm">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 text-gray-700 dark:text-gray-200 hover:bg-violet-100/60 dark:hover:bg-violet-900/20 transition-colors text-left"
        title="Toggle request payload"
      >
        <ChevronRight
          size={14}
          className={`flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="font-mono text-violet-700 dark:text-violet-300 text-sm">{headerText}</span>
      </button>

      {/* Expanded: full request payload */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {oneShot ? (
              <>
                This agent has no tools or skills available, so there&apos;s nothing for a ReAct
                loop to do. AgentPrimer sends a single non-streaming call directly with{' '}
                <code className="px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 font-mono">
                  response_format: &#123; type: &quot;json_object&quot; &#125;
                </code>{' '}
                and a fresh system prompt containing only the schema. The model&apos;s reply is the
                structured JSON panel shown below. Full request body sent to{' '}
                <code className="font-mono">/v1/chat/completions</code>:
              </>
            ) : (
              <>
                After the ReAct loop finished, AgentPrimer made one additional non-streaming call
                with{' '}
                <code className="px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 font-mono">
                  response_format: &#123; type: &quot;json_object&quot; &#125;
                </code>{' '}
                and a fresh system prompt containing only the schema — no agent role, no tool
                instructions. The full request body sent to{' '}
                <code className="font-mono">/v1/chat/completions</code> is below.
              </>
            )}
          </p>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <JsonView value={payload} initialDepth={Infinity} maxHeight="max-h-96" />
          </div>
        </div>
      )}
    </div>
  );
}
