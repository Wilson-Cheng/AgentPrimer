'use client';

/**
 * components/message/ToolCards.tsx
 * ---------------------------------------------------------------------------
 * All tool-related visual cards for assistant messages.
 *
 *   • LiveToolCard         – amber card for one tool invocation; renders args,
 *                            spinner, result, and the approval gate when
 *                            triggered by a dangerous tool.
 *   • LiveToolsPanel       – stacks N LiveToolCards (legacy non-ordered path).
 *   • HistoricalToolsTrace – collapsible list of tool calls loaded from DB.
 *   • SkillActivationCard  – indigo bubble listing which SKILL.md skills were
 *                            visible to the model this turn (Stage 1 of
 *                            progressive disclosure).
 */

import { useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wrench,
  XCircle,
} from 'lucide-react';
import type { AgentFileResult, ApprovalRequest, LiveToolInvocation, ToolCall } from './types';
import { AgentFileCard } from './FileBlocks';
import JsonView from '../ui/JsonView';

// ---------------------------------------------------------------------------
// LiveToolsPanel – shows tool calls as they stream in from msg.parts
// ---------------------------------------------------------------------------
export function LiveToolsPanel({
  invocations,
  sessionId,
  onApprovalGranted,
  onApprovalDenied,
  expandByDefault,
}: {
  invocations: LiveToolInvocation[];
  sessionId?: string;
  onApprovalGranted?: (inv: LiveToolInvocation, scope: 'once' | 'session' | 'permanent') => void;
  onApprovalDenied?: (inv: LiveToolInvocation) => void;
  expandByDefault?: boolean;
}) {
  return (
    <div className="w-full space-y-1.5">
      {invocations.map((inv) => (
        <LiveToolCard
          key={inv.toolCallId}
          inv={inv}
          sessionId={sessionId}
          onApprovalGranted={onApprovalGranted}
          onApprovalDenied={onApprovalDenied}
          expandByDefault={expandByDefault}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LiveToolCard – one streaming tool invocation
// ---------------------------------------------------------------------------
export function LiveToolCard({
  inv,
  sessionId,
  onApprovalGranted,
  onApprovalDenied,
  expandByDefault = false,
}: {
  inv: LiveToolInvocation;
  sessionId?: string;
  onApprovalGranted?: (inv: LiveToolInvocation, scope: 'once' | 'session' | 'permanent') => void;
  onApprovalDenied?: (inv: LiveToolInvocation) => void;
  expandByDefault?: boolean;
}) {
  const [expanded, setExpanded] = useState(expandByDefault);
  const [approving, setApproving] = useState(false);
  const [responseStatus, setResponseStatus] = useState<'approved' | 'denied' | null>(null);
  const isDone = inv.state === 'result';
  const isRunning = inv.state === 'partial-call' || inv.state === 'call';

  // Detect approval-gate results
  const approval =
    isDone &&
    inv.result !== null &&
    typeof inv.result === 'object' &&
    (inv.result as Record<string, unknown>).requires_approval === true
      ? (inv.result as ApprovalRequest)
      : null;

  // Detect agent_file results
  const agentFile =
    isDone &&
    inv.result !== null &&
    typeof inv.result === 'object' &&
    (inv.result as Record<string, unknown>).type === 'agent_file'
      ? (inv.result as AgentFileResult)
      : null;

  async function handleApprove(scope: 'once' | 'session' | 'permanent') {
    if (!sessionId || !approval) return;
    setApproving(true);
    try {
      await fetch('/api/approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          operation: approval.operation,
          scope,
          filePath: scope === 'once' ? approval.path : undefined,
        }),
      });
      setResponseStatus('approved');
      onApprovalGranted?.(inv, scope);
    } finally {
      setApproving(false);
    }
  }

  return (
    <div
      className={`w-full min-w-0 rounded-xl border overflow-hidden ${
        responseStatus === 'approved'
          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30'
          : responseStatus === 'denied'
            ? 'border-gray-300 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-900/30'
            : approval
              ? 'border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-950/30'
              : 'border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30'
      } text-sm`}
    >
      {/* Header row – always clickable (when not an approval gate) */}
      <button
        onClick={() => {
          if (approval) return;
          setExpanded((v) => !v);
        }}
        className={`w-full flex items-center gap-2 px-3 py-2 font-medium transition-colors ${
          approval
            ? 'text-red-800 dark:text-red-200 cursor-default'
            : 'text-amber-800 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-amber-900/30 cursor-pointer'
        }`}
      >
        {responseStatus ? (
          <CheckCircle2
            size={14}
            className={responseStatus === 'approved' ? 'text-emerald-500' : 'text-gray-400'}
          />
        ) : approval ? (
          <ShieldAlert size={14} className="text-red-500 flex-shrink-0" />
        ) : (
          <Wrench size={14} className="text-amber-600 flex-shrink-0" />
        )}
        <span className="font-mono">{inv.toolName}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {isRunning ? (
            <>
              <Loader2 size={14} className="animate-spin text-amber-500" />
              <span className="text-amber-500">Running…</span>
            </>
          ) : responseStatus === 'approved' ? (
            <>
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-emerald-600 dark:text-emerald-400">Approved</span>
            </>
          ) : responseStatus === 'denied' ? (
            <>
              <XCircle size={14} className="text-gray-400" />
              <span className="text-gray-500 dark:text-gray-400">Denied</span>
            </>
          ) : approval ? (
            <>
              <ShieldAlert size={14} className="text-red-500" />
              <span className="text-red-600 dark:text-red-400">Approval required</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="text-emerald-500" />
              <span className="text-emerald-600">Done</span>
            </>
          )}
          {!approval && (
            <ChevronRight
              size={14}
              className={`text-amber-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            />
          )}
        </span>
      </button>

      {/* Agent file preview – shown below the tool header, always visible */}
      {agentFile && (
        <div className="px-3 pb-3 border-t border-amber-200/60 dark:border-amber-800/60 pt-3">
          <AgentFileCard file={agentFile} />
        </div>
      )}

      {/* Approval gate panel – hidden once user has responded */}
      {approval && !responseStatus && (
        <div className="px-3 pb-3 border-t border-red-200/60 dark:border-red-700/60 space-y-3 mt-0">
          <p className="text-red-700 dark:text-red-300 mt-2 leading-snug">
            <span className="font-semibold">Requires approval:</span> {approval.description}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleApprove('once')}
              disabled={approving}
              className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-800 disabled:opacity-50 font-medium transition-colors"
            >
              Approve once
            </button>
            <button
              onClick={() => handleApprove('session')}
              disabled={approving}
              className="px-2.5 py-1 rounded-lg bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-800 disabled:opacity-50 font-medium transition-colors"
            >
              Allow this session
            </button>
            <button
              onClick={() => handleApprove('permanent')}
              disabled={approving}
              className="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800 disabled:opacity-50 font-medium transition-colors flex items-center gap-1"
            >
              <ShieldCheck size={14} />
              Always allow
            </button>
            <button
              onClick={() => {
                setResponseStatus('denied');
                onApprovalDenied?.(inv);
              }}
              disabled={approving}
              className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 font-medium transition-colors"
            >
              Deny
            </button>
          </div>
          {approving && <p className="text-red-500 text-sm">Saving approval…</p>}
        </div>
      )}

      {/* Normal expanded content – visible when expanded and not an approval gate */}
      {!approval && !agentFile && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="px-3 pb-3 border-t border-amber-200/60 dark:border-amber-800/60 space-y-2 mt-0 max-h-72 overflow-y-auto">
              {isRunning ? (
                <p className="text-amber-500 text-sm mt-2 flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin" />
                  Streaming arguments…
                </p>
              ) : (
                <div>
                  <p className="text-amber-700 dark:text-amber-300 font-medium mt-2 mb-1">
                    Arguments
                  </p>
                  <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-2 max-w-full">
                    <JsonView value={inv.args} initialDepth={1} maxHeight="max-h-40" />
                  </div>
                </div>
              )}
              {isDone && inv.result !== undefined && (
                <div>
                  <p className="text-amber-700 dark:text-amber-300 font-medium mb-1">Result</p>
                  <div className="bg-white/70 dark:bg-gray-800/70 rounded-lg p-2 max-w-full">
                    <JsonView
                      value={inv.result}
                      stringPassthrough
                      initialDepth={1}
                      maxHeight="max-h-40"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SkillActivationCard – surfaces SKILL.md skills that were exposed to the
// model this turn. Stage 1 of progressive disclosure: only the skill names
// and one-line descriptions are listed in the system prompt; the model
// activates a skill by calling the built-in `load_skill` tool, which shows
// up separately as an amber tool-call bubble. This card answers "which
// skills did the agent have available?" — the load_skill bubble answers
// "which one did it actually use?".
// ---------------------------------------------------------------------------
export function SkillActivationCard({
  skills,
}: {
  skills: Array<{ name: string; description: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!skills || skills.length === 0) return null;

  return (
    <div className="w-full min-w-0 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 overflow-hidden text-sm">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 font-medium text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100/60 dark:hover:bg-indigo-900/30 transition-colors"
      >
        <Sparkles size={14} className="text-indigo-500 flex-shrink-0" />
        <span>
          Skill{skills.length !== 1 ? 's' : ''} available
          <span className="ml-1.5 font-normal text-indigo-500 dark:text-indigo-400">
            ({skills.length})
          </span>
        </span>
        <span className="ml-2 truncate font-mono text-sm text-indigo-600 dark:text-indigo-400 min-w-0">
          {skills.map((s) => s.name).join(', ')}
        </span>
        <ChevronRight
          size={14}
          className={`ml-auto text-indigo-500 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pt-2 pb-3 border-t border-indigo-200/60 dark:border-indigo-800/60 space-y-2">
            <p className="text-sm text-indigo-700/70 dark:text-indigo-300/70 italic leading-snug">
              Only the names and descriptions below are in the system prompt. The model loads a
              skill&rsquo;s full instructions by calling the{' '}
              <code className="font-mono not-italic">load_skill</code> tool.
            </p>
            <ul className="space-y-2">
              {skills.map((skill) => (
                <li key={skill.name} className="flex flex-col gap-0.5">
                  <span className="font-mono text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                    {skill.name}
                  </span>
                  <span className="text-sm text-indigo-700/80 dark:text-indigo-300/80 leading-snug">
                    {skill.description}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HistoricalToolsTrace – fallback for DB-loaded messages (no live parts)
// ---------------------------------------------------------------------------
export function HistoricalToolsTrace({
  toolCalls,
  expandByDefault = false,
}: {
  toolCalls: ToolCall[];
  expandByDefault?: boolean;
}) {
  const [open, setOpen] = useState(expandByDefault);

  // Separate file results from regular tool calls for top-level display
  const fileResults = toolCalls
    .filter(
      (tc) =>
        tc.result !== null &&
        typeof tc.result === 'object' &&
        (tc.result as Record<string, unknown>).type === 'agent_file',
    )
    .map((tc) => tc.result as AgentFileResult);
  const otherCalls = toolCalls.filter(
    (tc) =>
      !(
        tc.result !== null &&
        typeof tc.result === 'object' &&
        (tc.result as Record<string, unknown>).type === 'agent_file'
      ),
  );

  return (
    <div className="w-full space-y-2">
      {/* Inline file previews */}
      {fileResults.map((f, i) => (
        <AgentFileCard key={i} file={f} />
      ))}

      {/* Collapsible trace for regular tool calls */}
      {otherCalls.length > 0 && (
        <>
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 text-sm text-amber-600 font-medium hover:text-amber-700 transition-colors"
          >
            <Wrench size={14} />
            {otherCalls.length} tool call{otherCalls.length !== 1 ? 's' : ''}
            <span className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
              ▾
            </span>
          </button>
          <div
            className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
          >
            <div className="overflow-hidden">
              <div className="mt-2 space-y-2">
                {otherCalls.map((tc, i) => (
                  <div
                    key={i}
                    className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm"
                  >
                    <p className="font-700 text-amber-800 dark:text-amber-200 mb-1.5 font-mono">
                      {tc.toolName}
                    </p>
                    <p className="text-gray-500 dark:text-gray-400 mb-1 font-medium">Arguments:</p>
                    <div className="bg-white dark:bg-gray-800 rounded p-2 max-w-full">
                      <JsonView value={tc.args} initialDepth={1} maxHeight="max-h-48" />
                    </div>
                    {tc.result !== undefined && (
                      <>
                        <p className="text-gray-500 dark:text-gray-400 mt-2 mb-1 font-medium">
                          Result:
                        </p>
                        <div className="bg-white dark:bg-gray-800 rounded p-2 max-w-full">
                          <JsonView
                            value={tc.result}
                            stringPassthrough
                            initialDepth={1}
                            maxHeight="max-h-48"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
