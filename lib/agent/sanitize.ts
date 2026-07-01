/**
 * lib/agent/sanitize.ts
 * ---------------------------------------------------------------------------
 * Sanitizers that:
 *   • strip role/chat-template markers from tool results so a malicious tool
 *     payload cannot redefine the conversation structure (in-prompt wire only —
 *     persisted/displayed values are untouched),
 *   • shrink oversized strings sent to the browser so the chat UI stays
 *     responsive,
 *   • convert arbitrary JS values to JSONValue for the AI SDK data stream.
 */
import type OpenAI from 'openai';
import type { JSONValue } from 'ai';

export function toJSONValue(value: unknown): JSONValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  if (Array.isArray(value)) return value.map(toJSONValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && typeof v !== 'function' && typeof v !== 'symbol')
        .map(([k, v]) => [k, toJSONValue(v)]),
    );
  }
  return String(value);
}

const CLIENT_STRING_LIMIT = 4000;

export function summarizeStringForClient(value: string): string {
  if (value.length <= CLIENT_STRING_LIMIT) return value;
  return `[omitted ${value.length.toLocaleString()} characters to keep the UI responsive] ${value.slice(0, 800)}`;
}

export function sanitizeArgsForClient(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (
      (toolName === 'write_file' || toolName === 'append_file') &&
      key === 'content' &&
      typeof value === 'string'
    ) {
      sanitized[key] = `[omitted ${value.length.toLocaleString()} characters written to disk]`;
    } else if (typeof value === 'string') {
      sanitized[key] = summarizeStringForClient(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function sanitizeResultForClient(result: unknown): unknown {
  if (typeof result === 'string') return summarizeStringForClient(result);
  if (Array.isArray(result)) return result.map(sanitizeResultForClient);
  if (result && typeof result === 'object') {
    return Object.fromEntries(
      Object.entries(result as Record<string, unknown>).map(([k, v]) => [
        k,
        sanitizeResultForClient(v),
      ]),
    );
  }
  return result;
}

/**
 * Strip role / chat-template markers that some model families (MiniMax,
 * ChatML, Llama-2, Mistral, Alpaca, OpenChat) treat as conversation-turn
 * boundaries. A prompt-injected tool result that smuggles in a fake role
 * header could otherwise be interpreted by the model as a new authoritative
 * message from the user or system. We rewrite any such marker into a
 * benign placeholder so the payload is still readable to the model but
 * cannot redefine the conversation structure.
 *
 * The sanitized string is what we forward to the LLM as `tool` role
 * content. The persisted value (and the streamed `tool_result` part) is the
 * untouched `result` — sanitization only happens on the in-prompt wire
 * payload, never on disk.
 */
const ROLE_TAG_PATTERNS: Array<{ name: string; re: RegExp; replacement: string }> = [
  // ChatML (MiniMax, Qwen, many others). Tolerate whitespace inside the
  // `<|im_start|>` token (some implementations insert spaces), case variations,
  // and deliberately malformed injection attempts that interleave the role
  // name with delimiters (e.g. `<| im_start | SYSTEM >`).
  {
    name: 'chatml-user',
    re: /<\|\s*im_start[\s|]*>[\s|]*(user)\b/gi,
    replacement: '⟪chatml:user⟫',
  },
  {
    name: 'chatml-assistant',
    re: /<\|\s*im_start[\s|]*>[\s|]*(assistant)\b/gi,
    replacement: '⟪chatml:assistant⟫',
  },
  {
    name: 'chatml-system',
    re: /<\|\s*im_start[\s|]*>[\s|]*(system)\b/gi,
    replacement: '⟪chatml:system⟫',
  },
  { name: 'chatml-end', re: /<\|\s*im_end\s*\|>/gi, replacement: '⟪chatml:end⟫' },
  // Llama-2 / Llama-3
  { name: 'llama-inst-start', re: /\[INST\]\s*/gi, replacement: '⟪llama:inst⟫ ' },
  { name: 'llama-inst-end', re: /\s*\[\/INST\]/gi, replacement: ' ⟪llama:/inst⟫' },
  { name: 'llama-sys', re: /<<\s*SYS\s*>>/gi, replacement: '⟪llama:sys⟫' },
  { name: 'llama-sys-end', re: /<<\s*\/SYS\s*>>/gi, replacement: '⟪llama:/sys⟫' },
  // Mistral / Alpaca
  { name: 'mistral-inst', re: /\[INST\]\s*/gi, replacement: '⟪mistral:inst⟫ ' },
  { name: 'mistral-inst-end', re: /\s*\[\/INST\]/gi, replacement: ' ⟪mistral:/inst⟫' },
  // Alpaca / OpenChat-style header lines
  { name: 'alpaca-inst', re: /^\s*###\s*Instruction:\s*$/gim, replacement: '⟪alpaca:instruction⟫' },
  { name: 'alpaca-resp', re: /^\s*###\s*Response:\s*$/gim, replacement: '⟪alpaca:response⟫' },
  // Plain role-tag forms used by some web pages
  { name: 'sys-tag', re: /<\s*system\s*>/gi, replacement: '⟪tag:system⟫' },
  { name: 'assistant-tag', re: /<\s*assistant\s*>/gi, replacement: '⟪tag:assistant⟫' },
  { name: 'user-tag', re: /<\s*user\s*>/gi, replacement: '⟪tag:user⟫' },
];

export function sanitizeToolResultContent(result: unknown): string {
  let text: string;
  if (typeof result === 'string') {
    text = result;
  } else {
    try {
      text = JSON.stringify(result);
    } catch {
      text = String(result);
    }
  }
  // NOTE: ROLE_TAG_PATTERNS use the `g` flag so `.replace` rewrites every
  // occurrence. Calling `re.test()` first is a trap: `test()` on a global
  // regex advances `lastIndex`, and because these RegExp objects are module-
  // level singletons that state leaks across calls, causing the next
  // invocation to skip matches near the start of its input. Just call
  // `.replace()` unconditionally — when nothing matches the string is
  // returned unchanged at no cost beyond the scan.
  for (const { re, replacement } of ROLE_TAG_PATTERNS) {
    text = text.replace(re, replacement);
  }
  return text;
}

export function sanitizeMessagesForClientTrace(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): JSONValue {
  return toJSONValue(
    messages.map((message) => {
      if (
        message.role !== 'assistant' ||
        !('tool_calls' in message) ||
        !Array.isArray(message.tool_calls)
      )
        return message;
      return {
        ...message,
        tool_calls: message.tool_calls.map((toolCall) => {
          if (toolCall.type !== 'function') return toolCall;
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            // best-effort: malformed args remain empty for the trace view
          }
          return {
            ...toolCall,
            function: {
              ...toolCall.function,
              arguments: JSON.stringify(sanitizeArgsForClient(toolCall.function.name, args)),
            },
          };
        }),
      };
    }),
  );
}
