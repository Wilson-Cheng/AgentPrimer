'use client';

/**
 * components/message/StructuredOutput.tsx
 * ---------------------------------------------------------------------------
 * Renders the JSON output of a structured-output agent (an agent with
 * `Output Schema:` set in agent.md) as a typed field table.
 *
 * This panel replaces the normal text bubble whenever a message comes from
 * an agent that produces JSON instead of free-form text.
 *
 * Layout:
 *   ┌─ header: schema label + copy button ──────────────────────────┐
 *   │ field_name │ value (string / colored badge / list / sub-panel) │
 *   │ …          │ …                                                  │
 *   ├─ Raw JSON (collapsible) ───────────────────────────────────────┤
 *   └────────────────────────────────────────────────────────────────┘
 */

import { useState } from 'react';
import { Check, ChevronRight, Copy } from 'lucide-react';
import JsonView from '../ui/JsonView';

// Special-cased badge colours for enum fields commonly used in structured output.
const SENTIMENT_STYLES: Record<string, string> = {
  positive: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  negative: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  neutral:  'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  mixed:    'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

export function StructuredOutputPanel({
  data, schemaName, schemaLabel,
}: {
  data: unknown;
  schemaName: string;
  schemaLabel?: string;
}) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isObject = data && typeof data === 'object' && !Array.isArray(data);
  const entries = isObject ? Object.entries(data as Record<string, unknown>) : [];

  return (
    <div className="w-full rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 overflow-hidden text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-emerald-100/80 dark:bg-emerald-900/30 border-b border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide flex-shrink-0">
            Structured Output
          </span>
          <span className="text-sm font-mono text-emerald-600 dark:text-emerald-500 bg-emerald-200/60 dark:bg-emerald-800/40 px-1.5 py-0.5 rounded truncate">
            {schemaLabel ?? schemaName}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 transition-colors flex-shrink-0 ml-2"
          title="Copy JSON"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {/* Field rows */}
      {isObject && entries.length > 0 ? (
        <div className="divide-y divide-emerald-100 dark:divide-emerald-900/40">
          {entries.map(([key, value]) => (
            <div key={key} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0 px-3 py-2">
              {/* Field name */}
              <span className="text-sm font-mono font-semibold text-emerald-700 dark:text-emerald-400 sm:w-40 flex-shrink-0 pt-0.5">
                {key}
              </span>
              {/* Field value */}
              <div className="min-w-0 flex-1">
                <StructuredFieldValue fieldKey={key} value={value} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3">
          <JsonView value={data} initialDepth={2} maxHeight="max-h-72" />
        </div>
      )}

      {/* Raw JSON (collapsed by default) */}
      <details className="border-t border-emerald-200 dark:border-emerald-800">
        <summary className="px-3 py-1.5 text-sm text-emerald-600 dark:text-emerald-500 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/20 select-none list-none flex items-center gap-1">
          <ChevronRight size={14} className="transition-transform [details[open]_&]:rotate-90" />
          Raw JSON
        </summary>
        <div className="p-3 bg-white/60 dark:bg-gray-900/40">
          <JsonView value={data} initialDepth={2} maxHeight="max-h-72" hideToolbar />
        </div>
      </details>
    </div>
  );
}

/** Renders a single field value from a structured output object. */
function StructuredFieldValue({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  // Enum/badge fields (sentiment, status, type, etc.)
  if (typeof value === 'string' && fieldKey === 'sentiment' && SENTIMENT_STYLES[value]) {
    return (
      <span className={`inline-block text-sm font-semibold px-2 py-0.5 rounded-full ${SENTIMENT_STYLES[value]}`}>
        {value}
      </span>
    );
  }

  if (typeof value === 'string') {
    return <p className="text-sm text-gray-800 dark:text-gray-200 break-words">{value || <em className="text-gray-400">—</em>}</p>;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <span className="text-sm font-mono text-indigo-600 dark:text-indigo-400">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <em className="text-sm text-gray-400">none</em>;
    return (
      <ul className="space-y-1 mt-0.5">
        {(value as unknown[]).map((item, idx) => (
          <li key={idx} className="flex items-start gap-1.5">
            <span className="text-emerald-400 mt-1 flex-shrink-0">•</span>
            {typeof item === 'object' && item !== null ? (
              <div className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-200">
                {Object.entries(item as Record<string, unknown>)
                  .map(([k, v]) => (
                    <span key={k} className="mr-2">
                      <span className="text-sm font-mono text-emerald-600 dark:text-emerald-400">{k}:</span>{' '}
                      <span>{String(v ?? '')}</span>
                    </span>
                  ))}
              </div>
            ) : (
              <span className="text-sm text-gray-800 dark:text-gray-200 break-words">{String(item)}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <div className="bg-emerald-100/50 dark:bg-emerald-900/20 rounded p-2">
        <JsonView value={value} initialDepth={1} maxHeight="max-h-40" hideToolbar />
      </div>
    );
  }

  return <em className="text-sm text-gray-400">—</em>;
}
