'use client';

import { useMemo, useState, useCallback, memo } from 'react';
import { ChevronRight, Copy, Check } from 'lucide-react';

/**
 * Reusable expand/collapse JSON viewer.
 *
 * Why in-repo instead of a library:
 *   AgentPrimer keeps deps lean (no Radix, no shadcn) and the surrounding
 *   cards each supply their own background (amber/violet/emerald/gray).
 *   A small bespoke viewer inherits the parent palette cleanly and stays
 *   under ~200 LOC.
 *
 * Usage:
 *   <JsonView value={anyJsonLikeValue} />
 *   <JsonView value={result} stringPassthrough />     // render strings verbatim
 *   <JsonView value={obj} initialDepth={2} />          // pre-expand 2 levels
 *   <JsonView value={obj} maxHeight="max-h-64" />      // override scroll cap
 *
 * Color scheme is borrowed from existing accents already used in the app:
 *   key   → violet, string → emerald, number → indigo, boolean → amber,
 *   null  → gray.
 */
export interface JsonViewProps {
  value: unknown;
  /** When true and value is a string, render the string verbatim (skip parsing). */
  stringPassthrough?: boolean;
  /** How many object/array levels to start expanded. Default 1 (top-level only). */
  initialDepth?: number;
  /** Tailwind max-height utility for the scroll viewport. Default `max-h-80`. */
  maxHeight?: string;
  /** Hide the toolbar (copy + expand-all). Default false. */
  hideToolbar?: boolean;
  /** Additional classes for the root container. */
  className?: string;
}

type Primitive = string | number | boolean | null;

const STRING_PREVIEW_LIMIT = 2000;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export default function JsonView({
  value,
  stringPassthrough = false,
  initialDepth = 1,
  maxHeight = 'max-h-80',
  hideToolbar = false,
  className = '',
}: JsonViewProps) {
  // String passthrough: tool results that are already strings (logs, free
  // text) shouldn't be JSON-parsed — keep the original whitespace.
  if (stringPassthrough && typeof value === 'string') {
    return (
      <pre
        className={`text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words ${maxHeight} overflow-y-auto ${className}`}
      >
        {value.length > STRING_PREVIEW_LIMIT ? `${value.slice(0, STRING_PREVIEW_LIMIT)}\n… truncated ${value.length - STRING_PREVIEW_LIMIT} characters` : value}
      </pre>
    );
  }

  return <JsonViewBody value={value} initialDepth={initialDepth} maxHeight={maxHeight} hideToolbar={hideToolbar} className={className} />;
}

function JsonViewBody({
  value,
  initialDepth,
  maxHeight,
  hideToolbar,
  className,
}: Required<Omit<JsonViewProps, 'value' | 'stringPassthrough'>> & { value: unknown }) {
  // Bumping this counter forces all child nodes to recompute their
  // `defaultOpen` state — used by Expand-all / Collapse-all.
  const [expandSignal, setExpandSignal] = useState(0);
  const [forceOpen, setForceOpen] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    try {
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // navigator.clipboard may be undefined in non-secure contexts; ignore.
    }
  }, [value]);

  const expandAll = useCallback(() => {
    setForceOpen(true);
    setExpandSignal(s => s + 1);
  }, []);
  const collapseAll = useCallback(() => {
    setForceOpen(false);
    setExpandSignal(s => s + 1);
  }, []);

  return (
    <div className={`relative ${className}`}>
      {!hideToolbar && (isObject(value) || Array.isArray(value)) && (
        <div className="flex items-center justify-end gap-1 mb-1 text-sm text-gray-500 dark:text-gray-400">
          <button
            type="button"
            onClick={expandAll}
            className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Expand all"
          >
            expand all
          </button>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <button
            type="button"
            onClick={collapseAll}
            className="px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Collapse all"
          >
            collapse all
          </button>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Copy JSON"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
      )}
      <div className={`text-sm font-mono text-gray-800 dark:text-gray-200 ${maxHeight} overflow-auto`}>
        <JsonNode
          value={value}
          depth={0}
          initialDepth={initialDepth}
          forceOpen={forceOpen}
          expandSignal={expandSignal}
          isRoot
        />
      </div>
    </div>
  );
}

interface NodeProps {
  value: unknown;
  depth: number;
  initialDepth: number;
  /** When set, overrides per-node default open state (used by Expand/Collapse all). */
  forceOpen: boolean | null;
  /** Bump to force re-resolution of `forceOpen`. */
  expandSignal: number;
  /** The key under which this node appears in its parent (rendered before the value). */
  label?: string | number;
  /** Whether this node is followed by a sibling in its parent (controls trailing comma). */
  hasComma?: boolean;
  /** True only for the outermost node (suppresses comma + label). */
  isRoot?: boolean;
}

const JsonNode = memo(function JsonNode({
  value,
  depth,
  initialDepth,
  forceOpen,
  expandSignal,
  label,
  hasComma,
  isRoot,
}: NodeProps) {
  // Primitive / null → render inline.
  if (value === null || typeof value !== 'object') {
    return (
      <div className="leading-snug" style={depth ? { paddingLeft: depth * 12 } : undefined}>
        {label !== undefined && <JsonKey label={label} />}
        <JsonPrimitive value={value as Primitive} />
        {hasComma ? <span className="text-gray-400">,</span> : null}
      </div>
    );
  }

  // Object / array — collapsible.
  return (
    <JsonContainer
      value={value as Record<string, unknown> | unknown[]}
      depth={depth}
      initialDepth={initialDepth}
      forceOpen={forceOpen}
      expandSignal={expandSignal}
      label={label}
      hasComma={hasComma}
      isRoot={isRoot}
    />
  );
});

function JsonContainer({
  value,
  depth,
  initialDepth,
  forceOpen,
  expandSignal,
  label,
  hasComma,
  isRoot,
}: NodeProps & { value: Record<string, unknown> | unknown[] }) {
  const isArr = Array.isArray(value);
  const entries: [string | number, unknown][] = useMemo(
    () =>
      isArr
        ? (value as unknown[]).map((v, i) => [i, v] as [number, unknown])
        : Object.entries(value as Record<string, unknown>),
    [value, isArr],
  );
  const isEmpty = entries.length === 0;
  const openBracket = isArr ? '[' : '{';
  const closeBracket = isArr ? ']' : '}';

  // Default open: top `initialDepth` levels. Expand/Collapse all overrides
  // via `forceOpen` + bumped `expandSignal` (so memoized children re-resolve).
  const computedDefault = useMemo(() => {
    if (forceOpen !== null) return forceOpen;
    return depth < initialDepth;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen, depth, initialDepth, expandSignal]);

  const [open, setOpen] = useState(computedDefault);
  // Resync when expand-all/collapse-all is pressed.
  const [lastSignal, setLastSignal] = useState(expandSignal);
  if (lastSignal !== expandSignal) {
    setLastSignal(expandSignal);
    setOpen(computedDefault);
  }

  if (isEmpty) {
    return (
      <div className="leading-snug" style={depth ? { paddingLeft: depth * 12 } : undefined}>
        {label !== undefined && <JsonKey label={label} />}
        <span className="text-gray-500">{openBracket}{closeBracket}</span>
        {hasComma ? <span className="text-gray-400">,</span> : null}
      </div>
    );
  }

  return (
    <div className="leading-snug">
      <div
        className="flex items-start gap-0.5 cursor-pointer select-none hover:bg-gray-100/60 dark:hover:bg-gray-700/40 rounded -mx-1 px-1"
        style={depth ? { paddingLeft: depth * 12 } : undefined}
        onClick={() => setOpen(o => !o)}
      >
        <ChevronRight
          size={12}
          className={`mt-1 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
        <div className="min-w-0">
          {label !== undefined && <JsonKey label={label} />}
          <span className="text-gray-500">{openBracket}</span>
          {!open && (
            <span className="text-gray-400 italic ml-1">
              {isArr ? `${entries.length} item${entries.length === 1 ? '' : 's'}` : `${entries.length} key${entries.length === 1 ? '' : 's'}`}
            </span>
          )}
          {!open && <span className="text-gray-500">{closeBracket}</span>}
          {!open && hasComma ? <span className="text-gray-400">,</span> : null}
        </div>
      </div>
      {open && (
        <>
          {entries.map(([k, v], idx) => (
            <JsonNode
              key={String(k)}
              value={v}
              depth={depth + 1}
              initialDepth={initialDepth}
              forceOpen={forceOpen}
              expandSignal={expandSignal}
              label={isArr ? undefined : (k as string)}
              hasComma={idx < entries.length - 1}
            />
          ))}
          <div style={{ paddingLeft: depth * 12 }} className="leading-snug">
            <span className="text-gray-500" style={{ paddingLeft: 14 }}>{closeBracket}</span>
            {!isRoot && hasComma ? <span className="text-gray-400">,</span> : null}
          </div>
        </>
      )}
    </div>
  );
}

function JsonKey({ label }: { label: string | number }) {
  if (typeof label === 'number') return null; // array indices are implicit
  return (
    <>
      <span className="text-violet-600 dark:text-violet-400">&quot;{label}&quot;</span>
      <span className="text-gray-500">: </span>
    </>
  );
}

function JsonPrimitive({ value }: { value: Primitive }) {
  if (value === null) return <span className="text-gray-400 italic">null</span>;
  if (typeof value === 'string') {
    // Strings can be very long — break instead of truncating so the user
    // can still see them, but rely on the scroll viewport upstream.
    return (
      <span className="text-emerald-600 dark:text-emerald-400 break-all whitespace-pre-wrap">
        &quot;{value.length > STRING_PREVIEW_LIMIT ? `${value.slice(0, STRING_PREVIEW_LIMIT)}… truncated ${value.length - STRING_PREVIEW_LIMIT} characters` : value}&quot;
      </span>
    );
  }
  if (typeof value === 'number') return <span className="text-indigo-600 dark:text-indigo-400">{String(value)}</span>;
  if (typeof value === 'boolean') return <span className="text-amber-600 dark:text-amber-400">{String(value)}</span>;
  return <span>{String(value)}</span>;
}
