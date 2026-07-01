'use client';

/**
 * components/message/Reasoning.tsx
 * ---------------------------------------------------------------------------
 * Components that render the model's chain-of-thought (reasoning_content) and
 * normal assistant text in a streaming-friendly way.
 *
 *   • ReasoningBlock   – collapsible violet "Thinking…" panel
 *   • StreamingTextPart – cursor-aware markdown renderer that defers updates
 *                         while tokens arrive faster than React can paint
 */

import { Brain, ChevronRight } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import MarkdownContent from '../MarkdownContent';

// ── Display caps ────────────────────────────────────────────────────────────
// Keep DOM nodes small for large file writes. The user sees the first N chars
// live; the full content appears the moment streaming completes.
const DISPLAY_LIMIT = 4000; // chars — assistant text
const REASONING_DISPLAY_LIMIT = 8000; // chars — chain-of-thought

export function truncateForDisplay(text: string): string {
  if (text.length <= DISPLAY_LIMIT) return text;
  return (
    text.slice(0, DISPLAY_LIMIT) + `\n\n… (${text.length - DISPLAY_LIMIT} more chars truncated)`
  );
}

function truncateReasoning(text: string): string {
  if (text.length <= REASONING_DISPLAY_LIMIT) return text;
  return (
    text.slice(0, REASONING_DISPLAY_LIMIT) +
    `\n\n… (${text.length - REASONING_DISPLAY_LIMIT} more chars truncated)`
  );
}

// ---------------------------------------------------------------------------
// StreamingTextPart – renders markdown while keeping UI responsive during streaming.
//
// During active streaming:
//   1. useDeferredValue lets React coalesce rapid token updates so the main
//      thread is not blocked on every single SSE chunk. React will render
//      intermediate values only when the thread is idle, skipping frames it
//      cannot keep up with.
//   2. DISPLAY_LIMIT prevents ReactMarkdown from parsing extremely large
//      content (e.g. a 500-line file being written) on every token.
// ---------------------------------------------------------------------------
export function StreamingTextPart({
  text,
  isStreaming,
  streamingCursor,
}: {
  text: string;
  isStreaming: boolean;
  streamingCursor: boolean;
}) {
  // useDeferredValue must be called unconditionally (Rules of Hooks).
  // During streaming React skips intermediate values when busy.
  const deferredText = useDeferredValue(text);
  // After streaming ends, render the final text immediately (no deferral).
  const renderText = isStreaming ? deferredText : text;
  const isCapped = isStreaming && renderText.length > DISPLAY_LIMIT;
  const displayText = isCapped ? renderText.slice(0, DISPLAY_LIMIT) : renderText;
  return (
    <>
      <MarkdownContent streamingCursor={streamingCursor && !isCapped} cheapRender={streamingCursor}>
        {displayText}
      </MarkdownContent>
      {isCapped && (
        <p className="text-sm text-gray-400 italic mt-2 flex items-center gap-1.5">
          … streaming {(renderText.length - DISPLAY_LIMIT).toLocaleString()} more chars
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ReasoningBlock – collapsible thinking section
// ---------------------------------------------------------------------------
export function ReasoningBlock({
  reasoning,
  isStreaming,
  expandByDefault = false,
}: {
  reasoning: string;
  /** True only while this specific part is the last streaming chunk (spinner). */
  isStreaming?: boolean;
  expandByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(expandByDefault);
  const scrollRef = useRef<HTMLPreElement>(null);
  /** Tracks whether the user is pinned to the bottom of the reasoning pane.
   *  We only auto-scroll while pinned, so a manual scroll-up pauses the
   *  follow-along until the user returns to the bottom. */
  const stickToBottomRef = useRef(true);
  /** rAF handle so we coalesce scroll-to-bottom writes that would otherwise
   *  fire once per streamed token. The forced-layout `scrollHeight` read is
   *  only paid once per animation frame instead of per render. */
  const scrollFrameRef = useRef<number | null>(null);

  const displayText = useMemo(() => truncateReasoning(reasoning), [reasoning]);
  const wordCount = useMemo(() => reasoning.trim().split(/\s+/).length, [reasoning]);

  // Cancel any pending rAF on unmount to avoid scribbling on a detached node.
  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, []);

  const scheduleScrollToBottom = (immediate = false) => {
    const el = scrollRef.current;
    if (!el) return;
    if (immediate) {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const node = scrollRef.current;
      if (!node || !stickToBottomRef.current) return;
      node.scrollTop = node.scrollHeight;
    });
  };

  // Auto-scroll to bottom while streaming new reasoning, unless the user has
  // scrolled up. Coalesced via rAF to avoid layout thrash on every token.
  useEffect(() => {
    if (!isStreaming || !expanded) return;
    if (!stickToBottomRef.current) return;
    scheduleScrollToBottom();
  }, [displayText, isStreaming, expanded]);

  // When the user expands the panel mid-stream, jump to the latest text.
  useEffect(() => {
    if (!expanded) return;
    stickToBottomRef.current = true;
    scheduleScrollToBottom(true);
  }, [expanded]);

  const handleScroll = (event: React.UIEvent<HTMLPreElement>) => {
    const el = event.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 24;
  };

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/40 overflow-hidden text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex justify-between items-center gap-2 px-3 py-2 text-violet-700 dark:text-violet-300 font-medium hover:bg-violet-100/60 dark:hover:bg-violet-900/40 transition-colors"
      >
        <>
          <Brain size={14} className="text-violet-500 shrink-0" />
          {isStreaming ? (
            <span className="flex items-center gap-1.5">
              Thinking…{' '}
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse" />
            </span>
          ) : (
            <span>
              Reasoning{' '}
              <span className="text-violet-400 dark:text-violet-500 font-normal">
                ({wordCount} words)
              </span>
            </span>
          )}
        </>
        <ChevronRight
          size={14}
          className={`ml-auto transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 border-t border-violet-200/60 dark:border-violet-800/60">
            <pre
              ref={scrollRef}
              onScroll={handleScroll}
              className="mt-2 text-sm text-violet-800/90 dark:text-violet-300/90 whitespace-pre-wrap break-words font-mono leading-relaxed overflow-x-auto max-h-72 overflow-y-auto"
            >
              {displayText}
              {isStreaming && (
                <span className="inline-block w-1 h-3 bg-violet-500 animate-pulse ml-0.5 align-middle" />
              )}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
