'use client';

/**
 * components/SendToRagDialog.tsx
 * ---------------------------------------------------------------------------
 * Step-by-step popup that runs one of two flows:
 *
 *   • mode='summary' (3 steps): Summarize chat → Send summary to RAG → Index
 *   • mode='content' (2 steps): Send content to RAG → Index
 *
 * Both flows are cancellable mid-process via an AbortController. When the
 * user cancels (or any step fails) we DELETE any RAG source row that we
 * created earlier in this run so the user is never left with a half-ingested
 * document. This matches the "Roll back created RAG source" behaviour the
 * user picked.
 *
 * The dialog also lets the user pick a scope when summarizing (single
 * message vs full chat history) before kicking off the work.
 */

import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw, X, AlertCircle, FileText } from 'lucide-react';
import Button from '@/components/ui/Button';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SummaryScope = 'message' | 'session';

export interface SendToRagSummaryProps {
  mode: 'summary';
  /** Title proposed for the new RAG source. User can edit before submit. */
  defaultTitle: string;
  /** The single assistant response text (used when scope='message'). */
  messageContent: string;
  /** Session id (used when scope='session'). When omitted scope falls back to 'message'. */
  sessionId?: string;
  onClose: () => void;
}

export interface SendToRagContentProps {
  mode: 'content';
  defaultTitle: string;
  /** Either inline text (the common case for markdown/html/text in the
   *  preview window, where the source bytes are already loaded) — OR a URL
   *  the dialog should fetch as a binary blob and upload as a PDF. */
  content?: string;
  /** When set, the dialog fetches this URL as a binary blob and POSTs as
   *  multipart/form-data so the server's PDF extractor can run. Used for
   *  PDFs in the chat preview window. */
  pdfUrl?: string;
  /** Filename used for the multipart upload + as the document title. */
  filename?: string;
  /** mime hint stored with the source so the View panel renders it properly.
   *  Ignored for PDF (mime is inferred from the .pdf extension server-side). */
  mime?: string;
  onClose: () => void;
}

type Props = SendToRagSummaryProps | SendToRagContentProps;

type StepState = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

interface Step {
  id: string;
  label: string;
  state: StepState;
  /** Sub-text shown under the step (e.g. error message, chunk count). */
  hint?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SendToRagDialog(props: Props) {
  const isSummary = props.mode === 'summary';

  // Pre-flight UI: pick scope + title before starting (only for 'summary' when
  // sessionId is available). For 'content' mode we still show a title field.
  const [phase, setPhase] = useState<'configure' | 'running' | 'done' | 'cancelled' | 'failed'>(
    'configure',
  );
  const [title, setTitle] = useState(props.defaultTitle);
  const [scope, setScope] = useState<SummaryScope>('message');

  const initialSteps: Step[] = isSummary
    ? [
        { id: 'summarize', label: 'Summarize chat content', state: 'pending' },
        { id: 'send', label: 'Send summary to the RAG service', state: 'pending' },
        { id: 'index', label: 'Index the summary in RAG', state: 'pending' },
      ]
    : [
        { id: 'send', label: 'Send content to the RAG service', state: 'pending' },
        { id: 'index', label: 'Index the content in RAG', state: 'pending' },
      ];

  const [steps, setSteps] = useState<Step[]>(initialSteps);
  /** id of the RAG source row this dialog *created* (NOT one we adopted via
   *  the `skipped: true` path — those pre-existed and must never be rolled
   *  back). Stored in a ref because cancel/cleanup need the latest value
   *  synchronously without waiting for a re-render. */
  const createdIdRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Helpers to mutate one step
  const setStep = (id: string, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  // Roll back any RAG source created during this run. Only ever called with
  // an id we actually created — never with an adopted (skipped) id.
  const rollback = async (id: number | null) => {
    if (!id) return;
    try {
      await fetch(`/api/rag/sources/${id}`, { method: 'DELETE' });
    } catch {
      /* best-effort */
    }
  };

  const handleCancel = async () => {
    // Abort any in-flight fetch, then roll back if needed
    abortRef.current?.abort();
    setSteps((prev) =>
      prev.map((s) =>
        s.state === 'running' || s.state === 'pending' ? { ...s, state: 'cancelled' } : s,
      ),
    );
    const id = createdIdRef.current;
    createdIdRef.current = null;
    if (id !== null) await rollback(id);
    setPhase('cancelled');
  };

  // Cleanup on unmount: also abort + rollback. Reads from the ref so the
  // latest id is visible regardless of when the dialog was unmounted.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      const id = createdIdRef.current;
      if (id !== null) {
        // Best-effort fire-and-forget DELETE.
        fetch(`/api/rag/sources/${id}`, { method: 'DELETE' }).catch(() => {});
      }
    };
  }, []);

  // Run the pipeline
  const runPipeline = async () => {
    if (!title.trim()) {
      // Fall back to a timestamp if user cleared it
      setTitle(`RAG entry ${new Date().toLocaleString()}`);
    }
    const finalTitle = title.trim() || `RAG entry ${new Date().toLocaleString()}`;
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase('running');
    setSteps(initialSteps); // reset

    let textToIngest = '';
    let mime = 'text/markdown';

    try {
      // ── Summary flow: step 1 — summarize ───────────────────────────────
      if (isSummary) {
        setStep('summarize', { state: 'running' });
        const reqBody =
          scope === 'session' && props.sessionId
            ? { sessionId: props.sessionId }
            : { messageContent: props.messageContent };
        const res = await fetch('/api/rag/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
          signal: ac.signal,
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Summarize failed (HTTP ${res.status})`);
        }
        const data = (await res.json()) as { summary: string };
        textToIngest = data.summary;
        setStep('summarize', {
          state: 'done',
          hint: `${textToIngest.length.toLocaleString()} characters`,
        });
      } else {
        // content mode — text in props.content (or PDF blob fetched below)
        textToIngest = props.content ?? '';
        mime = props.mime ?? 'text/plain';
      }

      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // ── Step (n−1): create the RAG source (sends content to the service)
      setStep('send', { state: 'running' });

      let sendRes: Response;
      // Binary path: fetch the bytes and upload as multipart so the server
      // pdftotext extractor can run. Used for chat-preview PDFs.
      if (!isSummary && props.pdfUrl) {
        const blobRes = await fetch(props.pdfUrl, { signal: ac.signal });
        if (!blobRes.ok) throw new Error(`Could not load source file (HTTP ${blobRes.status})`);
        const blob = await blobRes.blob();
        const fname = props.filename || 'document.pdf';
        const form = new FormData();
        form.append('name', finalTitle);
        form.append('file', new File([blob], fname, { type: blob.type || 'application/pdf' }));
        sendRes = await fetch('/api/rag/sources', {
          method: 'POST',
          body: form,
          signal: ac.signal,
        });
      } else {
        // Text path
        sendRes = await fetch('/api/rag/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: finalTitle,
            content: textToIngest,
            source_type: isSummary ? 'chat_summary' : 'preview_send',
            original_mime: mime,
          }),
          signal: ac.signal,
        });
      }
      if (!sendRes.ok) {
        const err = (await sendRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Send failed (HTTP ${sendRes.status})`);
      }
      const sendData = (await sendRes.json()) as {
        sourceId: number;
        chunks: number;
        embedded: boolean;
        skipped: boolean;
      };
      // Only adopt the id when WE created the row. The `skipped: true` path
      // returns the id of a pre-existing source — rolling that back would
      // delete data the user already had.
      if (!sendData.skipped) createdIdRef.current = sendData.sourceId;
      setStep('send', {
        state: 'done',
        hint: sendData.skipped ? 'Already existed (identical content)' : 'Stored on the server',
      });

      if (ac.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // ── Last step: indexing.
      // The /api/rag/sources POST above already indexes synchronously; this
      // step is here purely to surface the indexing outcome to the user as a
      // distinct, reassuring tick. The "running" flash is intentional so the
      // dialog reads as a multi-step process.
      setStep('index', { state: 'running' });
      // small visual delay for clarity
      await new Promise((r) => setTimeout(r, 300));
      const indexHint = sendData.skipped
        ? 'No re-indexing needed'
        : `Indexed ${sendData.chunks} chunk${sendData.chunks !== 1 ? 's' : ''}` +
          (sendData.embedded ? ' with embeddings' : ' (FTS only — embedding unavailable)');
      setStep('index', { state: 'done', hint: indexHint });

      // Pipeline succeeded — the source is now permanent. Clear the ref so
      // closing the dialog (which unmounts and runs the cleanup effect)
      // does NOT issue a DELETE for a row the user wants to keep.
      createdIdRef.current = null;
      setPhase('done');
    } catch (e) {
      // Distinguish cancel vs error
      const isAbort =
        (e instanceof DOMException && e.name === 'AbortError') ||
        (e instanceof Error && /aborted/i.test(e.message));
      // Mark the currently-running step
      setSteps((prev) =>
        prev.map((s) =>
          s.state === 'running'
            ? {
                ...s,
                state: isAbort ? 'cancelled' : 'error',
                hint: isAbort ? undefined : e instanceof Error ? e.message : String(e),
              }
            : s.state === 'pending'
              ? { ...s, state: isAbort ? 'cancelled' : 'pending' }
              : s,
        ),
      );
      // Roll back any partial source row that *we* created
      const id = createdIdRef.current;
      createdIdRef.current = null;
      if (id !== null) await rollback(id);
      setPhase(isAbort ? 'cancelled' : 'failed');
    }
  };

  // ── UI ──────────────────────────────────────────────────────────────────────
  const titleText = isSummary ? 'Send summary to RAG' : 'Send to RAG';

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-700 text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <FileText size={16} className="text-teal-500" />
            {titleText}
          </h3>
          {phase !== 'running' && (
            <button
              onClick={props.onClose}
              className="h-7 w-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {phase === 'configure' && (
            <>
              <div>
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1.5">
                  Document name
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {isSummary && props.sessionId && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-1.5">
                    What to summarize
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === 'message'}
                        onChange={() => setScope('message')}
                      />
                      Just this response
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="scope"
                        checked={scope === 'session'}
                        onChange={() => setScope('session')}
                      />
                      The whole conversation
                    </label>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Step list */}
          {phase !== 'configure' && (
            <ol className="space-y-3">
              {steps.map((s, i) => (
                <li key={s.id} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-5 w-5 items-center justify-center flex-shrink-0">
                    {s.state === 'done' && <Check size={16} className="text-green-500" />}
                    {s.state === 'running' && (
                      <RefreshCw size={14} className="text-teal-500 animate-spin" />
                    )}
                    {s.state === 'error' && <AlertCircle size={16} className="text-red-500" />}
                    {s.state === 'cancelled' && <X size={16} className="text-gray-400" />}
                    {s.state === 'pending' && (
                      <span className="h-4 w-4 rounded-full border-2 border-gray-300 dark:border-gray-600" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div
                      className={`text-sm font-medium ${
                        s.state === 'error'
                          ? 'text-red-600 dark:text-red-400'
                          : s.state === 'cancelled'
                            ? 'text-gray-400'
                            : s.state === 'done'
                              ? 'text-gray-900 dark:text-gray-100'
                              : s.state === 'running'
                                ? 'text-gray-900 dark:text-gray-100'
                                : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {i + 1}. {s.label}
                    </div>
                    {s.hint && (
                      <div
                        className={`text-sm mt-0.5 ${
                          s.state === 'error' ? 'text-red-500 dark:text-red-400' : 'text-gray-400'
                        }`}
                      >
                        {s.hint}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          {phase === 'configure' && (
            <>
              <Button variant="secondary" size="sm" onClick={props.onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={runPipeline}
                className="bg-teal-500 hover:bg-teal-600 text-white border-transparent"
              >
                Start
              </Button>
            </>
          )}
          {phase === 'running' && (
            <Button variant="secondary" size="sm" onClick={handleCancel}>
              Cancel
            </Button>
          )}
          {(phase === 'done' || phase === 'cancelled' || phase === 'failed') && (
            <Button
              variant="primary"
              size="sm"
              onClick={props.onClose}
              className="bg-teal-500 hover:bg-teal-600 text-white border-transparent"
            >
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
