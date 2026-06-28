'use client';

/**
 * components/message/TraceDrawer.tsx
 * ---------------------------------------------------------------------------
 * Observability components for assistant messages.
 *
 *   • TokenUsageBadge – compact ↑input / ↓output / context-gauge pill shown
 *                       beneath every assistant message.
 *   • TraceDrawer     – modal that shows a per-step breakdown of the agent
 *                       loop: timing, tokens, tool calls, full request body.
 *   • TraceStat       – small label/value box reused inside the drawer.
 *
 * Both rely on the AgentStepTrace type that `lib/agent.ts` produces when
 * tracing is enabled in Settings.
 */

import { useState } from 'react';
import { ChevronRight, Eye, Info, X } from 'lucide-react';
import type { AgentStepTrace, MessageTokenUsage } from './types';
import JsonView from '../ui/JsonView';

// ---------------------------------------------------------------------------
// TokenUsageBadge – compact token count display below assistant messages
// ---------------------------------------------------------------------------
export function TokenUsageBadge({
  usage, contextLength, outputLength,
}: {
  usage: MessageTokenUsage;
  contextLength?: number;
  outputLength?: number;
}) {
  const input  = usage.input  ?? 0;
  const cached = usage.cached ?? 0;
  const output = usage.output ?? 0;
  const total  = input + output;
  const sourceJson = usage.source ? JSON.stringify(usage.source, null, 2) : '';

  // context gauge — input tokens represent consumed context
  const pct = contextLength ? Math.min(100, (input / contextLength) * 100) : null;
  const outputPct = outputLength ? Math.min(100, (output / outputLength) * 100) : null;
  const gaugeColor =
    pct === null ? '' :
    pct > 80    ? 'bg-red-500' :
    pct > 50    ? 'bg-amber-400' :
                  'bg-blue-500';
  const outputGaugeColor =
    outputPct === null ? '' :
    outputPct > 80    ? 'bg-red-500' :
    outputPct > 50    ? 'bg-amber-400' :
                        'bg-violet-500';

  const fmtCtx = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000     ? `${Math.round(n / 1_000)}k` :
    String(n);

  return (
    <div className="mt-0.5 flex items-center gap-2 flex flex-wrap mb-2">
      {/* Token counts pill */}
      <span
        className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700"
        title={sourceJson || `Input: ${input.toLocaleString()}${cached > 0 ? ` (cached: ${cached.toLocaleString()})` : ''}  |  Output: ${output.toLocaleString()}  |  Total: ${total.toLocaleString()}`}
      >
        <span className="flex items-center gap-1 text-nowrap">
          <span className="text-blue-400 text-nowrap">↑</span>
          {cached > 0
            ? <>{input.toLocaleString()} <span className="text-emerald-400">({cached.toLocaleString()})</span></>
            : input.toLocaleString()
          }
        </span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span className="flex items-center gap-1">
          <span className="text-violet-400">↓</span>
          {output.toLocaleString()}
        </span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span className="text-nowrap">∑ {total.toLocaleString()}</span>
        {sourceJson && <Info size={12} className="opacity-60" />}
      </span>

      {/* Context gauge */}
      {pct !== null && contextLength != null && (
        <span
          className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700"
          title={`Context used: ${input.toLocaleString()} / ${contextLength.toLocaleString()} tokens (${pct.toFixed(1)}%)`}
        >
          {/* Bar track */}
          <span className="relative w-20 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 overflow-hidden flex-shrink-0">
            <span
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${gaugeColor}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="tabular-nums">
            {fmtCtx(input)}<span className="opacity-50">/</span>{fmtCtx(contextLength)}
          </span>
        </span>
      )}

      {outputPct !== null && outputLength != null && (
        <span
          className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-sm font-mono bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700"
          title={`Output used: ${output.toLocaleString()} / ${outputLength.toLocaleString()} tokens (${outputPct.toFixed(1)}%)`}
        >
          <span className="relative w-20 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 overflow-hidden flex-shrink-0">
            <span
              className={`absolute left-0 top-0 h-full rounded-full transition-all duration-300 ${outputGaugeColor}`}
              style={{ width: `${outputPct}%` }}
            />
          </span>
          <span className="tabular-nums">
            ↓{fmtCtx(output)}<span className="opacity-50">/</span>{fmtCtx(outputLength)}
          </span>
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TraceStat – label/value box shown inside the trace drawer header
// ---------------------------------------------------------------------------
function TraceStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-900/50 px-3 py-2">
      <p className="text-sm text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TraceDrawer – per-step agent loop trace viewer (modal)
// ---------------------------------------------------------------------------
export function TraceDrawer({
  trace, onClose,
}: {
  trace: AgentStepTrace[];
  onClose: () => void;
}) {
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const totalTokens = trace.reduce((sum, s) => ({
    input: sum.input + (s.token_usage?.input ?? 0),
    output: sum.output + (s.token_usage?.output ?? 0),
    cached: sum.cached + (s.token_usage?.cached ?? 0),
  }), { input: 0, cached: 0, output: 0 });
  const totalDuration = trace.reduce((sum, s) => sum + s.duration_ms, 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg min-w-9 bg-violet-500 flex items-center justify-center">
              <Eye size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-700 text-gray-900 dark:text-gray-100">Agent Trace</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {trace.length} step{trace.length !== 1 ? 's' : ''} · {totalDuration}ms total · ∑ {totalTokens.input.toLocaleString()}↑ {totalTokens.output.toLocaleString()}↓
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Step list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {trace.map((step, i) => {
            const open = expandedStep === i;
            return (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                {/* Step header */}
                <button
                  onClick={() => setExpandedStep(open ? null : i)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/80 transition-colors text-left"
                >
                  <span className="h-6 w-6 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-sm font-700 flex items-center justify-center flex-shrink-0">
                    {step.step_index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-gray-800 dark:text-gray-200">
                      Step {step.step_index + 1}
                      <span className="ml-2 text-sm font-mono text-gray-400">{step.finish_reason}</span>
                    </p>
                    <p className="text-sm text-gray-400">
                      {step.duration_ms}ms · ↑{step.token_usage?.input ?? 0} · ↓{step.token_usage?.output ?? 0}
                      {step.token_usage?.cached ? ` (${step.token_usage.cached})` : ''}
                      {step.tool_calls.length > 0 ? ` · ${step.tool_calls.length} tool call${step.tool_calls.length !== 1 ? 's' : ''}` : ''}
                    </p>
                  </div>
                  <ChevronRight size={15} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
                </button>

                {/* Expanded details */}
                <div className={`grid transition-[grid-template-rows] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="px-4 pb-3 space-y-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm">
                        <TraceStat label="Duration" value={`${step.duration_ms}ms`} />
                        <TraceStat label="Finish" value={step.finish_reason} />
                        <TraceStat label="Model" value={step.request?.model ?? 'unknown'} />
                      </div>

                      {step.request && (
                        <div>
                          <p className="text-sm font-600 text-gray-500 dark:text-gray-400 mb-1">LLM Request Messages</p>
                          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2">
                            <JsonView value={step.request.messages} initialDepth={1} maxHeight="max-h-80" />
                          </div>
                        </div>
                      )}

                      {step.request?.tools !== undefined && (
                        <div>
                          <p className="text-sm font-600 text-gray-500 dark:text-gray-400 mb-1">Available Tools Sent to LLM</p>
                          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2">
                            <JsonView value={step.request.tools} initialDepth={1} maxHeight="max-h-64" />
                          </div>
                        </div>
                      )}

                      {step.token_usage && (step.token_usage.input || step.token_usage.output) && (
                        <div>
                          <p className="text-sm font-600 text-gray-500 dark:text-gray-400 mb-1">Token Usage</p>
                          <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-2">
                            <JsonView value={step.token_usage} initialDepth={2} maxHeight="max-h-32" hideToolbar />
                          </div>
                        </div>
                      )}

                      {step.tool_calls.length > 0 && (
                        <div>
                          <p className="text-sm font-600 text-gray-500 dark:text-gray-400 mb-1">Tool Calls</p>
                          {step.tool_calls.map((tc, j) => (
                            <div key={j} className="mb-2 last:mb-0">
                              <p className="text-sm font-mono font-600 text-amber-700 dark:text-amber-300 mb-0.5">{tc.toolName}</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div>
                                  <p className="text-sm text-gray-400 mb-0.5">Input JSON</p>
                                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1.5">
                                    <JsonView value={tc.args} initialDepth={1} maxHeight="max-h-48" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-sm text-gray-400 mb-0.5">Output JSON</p>
                                  <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-1.5">
                                    <JsonView value={tc.result} stringPassthrough initialDepth={1} maxHeight="max-h-48" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
