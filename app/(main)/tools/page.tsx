'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Server,
  HardDrive,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  Wrench,
  AlertTriangle,
  FunctionSquare,
  BookOpen,
  ArrowLeft,
} from 'lucide-react';
import JsonView from '@/components/ui/JsonView';

// ── Tab type ─────────────────────────────────────────────────────────────────
// Four categories of tools, each with a different execution model:
//
//   builtin       → In-process TypeScript functions (read_file, search_web, etc.)
//   skills        → SKILL.md instruction modules — NOT callable, shown as previews
//   function_tool → OpenAI function-calling tools (subprocess execution)
//   mcp           → Model Context Protocol tools (MCP server execution)
//
type Tab = 'builtin' | 'skills' | 'function_tool' | 'mcp';

interface Parameter {
  type?: string;
  description?: string;
  properties?: Record<string, Parameter>;
  required?: string[];
  items?: Parameter;
  default?: unknown;
  enum?: string[];
}

interface ToolEntry {
  id: string;
  name: string;
  description: string;
  parameters: Parameter;
  category: string;
  source: string;
  /** For skills only: the full raw SKILL.md content to display */
  body?: string;
}

export default function ToolsPage() {
  const [tab, setTab] = useState<Tab>('skills');
  const [enabled, setEnabled] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [builtins, setBuiltins] = useState<ToolEntry[]>([]);
  const [skills, setSkills] = useState<ToolEntry[]>([]);
  const [functionTools, setFunctionTools] = useState<ToolEntry[]>([]);
  const [mcp, setMcp] = useState<ToolEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(null);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [execError, setExecError] = useState('');

  const fetchTools = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/tools');
      if (!res.ok) throw new Error((await res.text()) || 'Failed to load tools');
      const data = await res.json();
      setBuiltins(data.builtins ?? []);
      setSkills(data.skills ?? []);
      setFunctionTools(data.functionTools ?? []);
      setMcp(data.mcp ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setEnabled(data.settings?.tool_playground !== 'false');
        setSettingsLoaded(true);
      })
      .catch(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  const currentTools =
    tab === 'builtin'
      ? builtins
      : tab === 'skills'
        ? skills
        : tab === 'function_tool'
          ? functionTools
          : mcp;

  const selectTool = (tool: ToolEntry) => {
    setSelectedTool(tool);
    setFormValues({});
    setResult(null);
    setExecError('');
  };

  // ── Auto-select the first tool whenever the active tab gains a list ──────
  // Triggered by tab switches AND by the initial load completing. We only
  // auto-pick when nothing is currently selected in the visible list — so a
  // user who clicked a specific tool and is mid-edit isn't yanked away.
  //
  // SKIPPED on narrow viewports (< md, 768px): on mobile the list and the
  // detail panel are mutually exclusive (the list hides when a tool is
  // picked) — auto-selecting on first load would land the user straight in
  // the detail with no way to see the list short of clicking the back
  // button. Desktop and above are unaffected: both panels are visible
  // simultaneously, so the auto-pick is convenient there.
  useEffect(() => {
    if (currentTools.length === 0) return;
    if (selectedTool && currentTools.some((t) => t.id === selectedTool.id)) return;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    selectTool(currentTools[0]);
  }, [tab, currentTools, selectedTool]);

  // ── Skills: auto-preview as soon as the user selects one ─────────────────
  // Skills are not callable, so the only useful action is to read the
  // injected SKILL.md body. Fetching automatically removes a meaningless
  // "Preview Skill" click step. Re-runs whenever `selectedTool` or `tab`
  // changes; bails out for non-skill selections.
  useEffect(() => {
    if (tab !== 'skills' || !selectedTool) return;
    let cancelled = false;
    setExecuting(true);
    setResult(null);
    setExecError('');
    (async () => {
      try {
        const res = await fetch('/api/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toolId: selectedTool.id, toolType: 'skill', args: {} }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to preview skill');
        if (!cancelled) setResult(data.result);
      } catch (err) {
        if (!cancelled) setExecError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setExecuting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTool, tab]);

  const handleSubmit = async () => {
    if (!selectedTool) return;
    setExecuting(true);
    setResult(null);
    setExecError('');

    // ── Callable tools: parse form values and execute ─────────────────────
    const parsed: Record<string, unknown> = {};
    const props = selectedTool.parameters?.properties ?? {};
    for (const key of Object.keys(props)) {
      const val = formValues[key];
      if (val === undefined || val === '') {
        if ((selectedTool.parameters?.required ?? []).includes(key)) {
          parsed[key] = val;
        }
        continue;
      }
      const type = props[key]?.type ?? 'string';
      if (type === 'number' || type === 'integer') {
        parsed[key] = Number(val);
      } else if (type === 'boolean') {
        parsed[key] = val === 'true';
      } else if (type === 'array') {
        // Accept three input styles, in order:
        //   1. Real JSON array — e.g. ["a","b"]   (strict, used as-is)
        //   2. Newline-separated list — one entry per line → ["a","b"]
        //   3. Bare single value — e.g. cnn.com   → ["cnn.com"]
        //
        // Commas are intentionally NOT used as a separator because legitimate
        // array values (people names, file paths with commas, prose strings)
        // often contain commas — auto-splitting on them mangles the data.
        // Users with comma-containing values should use the JSON-array form.
        //
        // The pre-fix bug: the Playground sent the raw string downstream when
        // JSON.parse failed, which the MCP server then tried to JSON.parse
        // again — producing the confusing "Unexpected token 'h', ..." error
        // from inside the third-party server.
        const trimmed = val.trim();
        try {
          const j = JSON.parse(trimmed);
          parsed[key] = Array.isArray(j) ? j : [j];
        } catch {
          const split = trimmed
            .split(/\n+/)
            .map((s) => s.trim())
            .filter(Boolean);
          parsed[key] = split.length > 1 ? split : [trimmed];
        }
      } else if (type === 'object') {
        try {
          parsed[key] = JSON.parse(val);
        } catch {
          parsed[key] = val;
        }
      } else {
        parsed[key] = val;
      }
    }
    try {
      const res = await fetch('/api/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolId: selectedTool.id,
          toolType:
            tab === 'builtin' ? 'builtin' : tab === 'function_tool' ? 'function_tool' : 'mcp',
          args: parsed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Execution failed');
      setResult(data.result);
    } catch (err) {
      setExecError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const allCount = builtins.length + skills.length + functionTools.length + mcp.length;
  const isSkillTab = tab === 'skills';

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-amber-600 pl-14 pr-6 py-6 md:px-8 md:py-10 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-8 w-32 h-32 bg-white/10 rounded-full translate-y-1/2" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 min-w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Wrench size={24} className="text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-800 text-white tracking-tight">Tool Playground</h1>
              <p className="text-amber-200 text-sm">
                Test built-in tools, function tools, and MCP tools. Preview skill instructions.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex-shrink-0 bg-red-50 dark:bg-red-950/60 border-b border-red-200 dark:border-red-800">
        <div className="max-w-6xl mx-auto px-8 py-2.5 flex items-center gap-2.5 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle size={16} className="flex-shrink-0 text-red-500" />
          <span>
            Tools execute directly on the server. <strong>Test cautiously</strong> — file writes,
            deletes, and shell commands can damage the system or cause data loss.
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto px-4 md:px-8 py-4 md:py-6">
          <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0">
            {!settingsLoaded ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : !enabled ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                <Wrench size={40} className="mb-4 opacity-30" />
                <p className="text-sm font-600 text-gray-500 dark:text-gray-400 mb-1">
                  Tool Playground is disabled
                </p>
                <p className="text-sm">
                  Enable it in{' '}
                  <a
                    href="/settings"
                    className="text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Settings
                  </a>{' '}
                  to test tools interactively.
                </p>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading tools...</span>
              </div>
            ) : error ? (
              <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300 text-sm">
                {error}
              </div>
            ) : allCount === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <Wrench size={32} className="mx-auto mb-3 opacity-50" />
                <p className="text-sm">
                  No tools available. Configure your API key in Settings first.
                </p>
              </div>
            ) : (
              <div className="flex flex-col md:flex-row gap-6 flex-1 min-h-0">
                {/* Tool list sidebar — on mobile, hide when a tool is selected */}
                <div
                  className={`w-full md:w-100 flex-shrink-0 flex flex-col ${selectedTool ? 'hidden md:flex' : 'flex'}`}
                >
                  {/* Tabs — one per tool category */}
                  <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 flex-wrap">
                    {[
                      {
                        id: 'skills' as Tab,
                        label: 'Skills',
                        icon: BookOpen,
                        count: skills.length,
                        title: 'SKILL.md instruction modules (context injection)',
                      },
                      {
                        id: 'function_tool' as Tab,
                        label: 'Fn Tools',
                        icon: FunctionSquare,
                        count: functionTools.length,
                        title: 'OpenAI function-calling tools (subprocess)',
                      },
                      {
                        id: 'mcp' as Tab,
                        label: 'MCP',
                        icon: Server,
                        count: mcp.length,
                        title: 'Model Context Protocol tools',
                      },
                      {
                        id: 'builtin' as Tab,
                        label: 'Built-in',
                        icon: HardDrive,
                        count: builtins.length,
                        title: 'In-process TypeScript tools',
                      },
                    ].map(({ id, label, icon: Icon, title }) => (
                      <button
                        key={id}
                        title={title}
                        onClick={() => {
                          setTab(id);
                          setSelectedTool(null);
                        }}
                        className={`min-w-[40%] md:min-w-0 flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-600 transition-colors ${
                          tab === id
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        <Icon size={13} />
                        {label}
                        {/* <span className="ml-0.5 opacity-60">({count})</span> */}
                      </button>
                    ))}
                  </div>

                  {/* Contextual hint for skills tab */}
                  {isSkillTab && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
                      <strong>Skills are instruction modules</strong>, not callable functions. Their
                      SKILL.md content is injected into the agent system prompt.
                    </div>
                  )}

                  {/* Contextual hint for function tools tab */}
                  {tab === 'function_tool' && (
                    <div className="mb-3 px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 text-sm text-purple-700 dark:text-purple-300">
                      <strong>Function tools</strong> follow the OpenAI function-calling spec. The
                      model emits a <code>tool_call</code>; the server runs <code>index.js</code> in
                      a subprocess.
                    </div>
                  )}

                  {/* Tool list */}
                  <div className="flex-1 space-y-1 overflow-y-auto pr-1">
                    {currentTools.map((tool) => (
                      <button
                        key={tool.id}
                        onClick={() => selectTool(tool)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors border ${
                          selectedTool?.id === tool.id
                            ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'
                            : 'bg-gray-50 dark:bg-gray-800/50 border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        <p className="font-mono text-sm font-600">{tool.name}</p>
                        <p className="text-sm mt-0.5 opacity-70 line-clamp-2">{tool.description}</p>
                      </button>
                    ))}
                    {currentTools.length === 0 && (
                      <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                        No tools in this category
                      </p>
                    )}
                  </div>
                </div>

                {/* Detail / form panel — constrained to viewport height.
                  On mobile, hidden until a tool is selected (the user
                  navigates to it from the list, then taps "Back" to
                  return). On md+ it sits permanently next to the list. */}
                <div
                  className={`flex-1 min-w-0 flex-col min-h-0 overflow-hidden ${selectedTool ? 'flex' : 'hidden md:flex'}`}
                >
                  {selectedTool ? (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col flex-1 min-h-0 overflow-hidden">
                      {/* Tool header — fixed at top */}
                      <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          {/* Mobile-only back button — returns to the tool
                            list on small screens (hidden on md+ because
                            the list is permanently visible there). */}
                          <button
                            onClick={() => setSelectedTool(null)}
                            className="md:hidden flex items-center justify-center h-7 w-7 -ml-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title="Back to tool list"
                            aria-label="Back to tool list"
                          >
                            <ArrowLeft size={16} />
                          </button>
                          <span className="px-2 py-0.5 rounded text-sm font-mono font-600 bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
                            {tab === 'function_tool' ? 'function tool' : tab}
                          </span>
                          <h2 className="font-mono text-sm font-700 text-gray-900 dark:text-gray-100">
                            {selectedTool.name}
                          </h2>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {selectedTool.description}
                        </p>
                        {selectedTool.source !== selectedTool.name && (
                          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                            Source: {selectedTool.source}
                          </p>
                        )}
                      </div>

                      {/* Content area below the header.
                        This is a flex column (no overflow) so the result
                        box can claim the remaining height with min-h-0
                        and the <pre> inside scrolls long content — that
                        keeps the green box itself inside the panel. */}
                      <div className="flex-1 min-h-0 p-4 flex flex-col">
                        {/* Form / loader region — `flex-shrink-0` so it
                        doesn't squash the result below; capped with
                        `max-h-1/2` and `overflow-y-auto` so a long
                        parameter form scrolls on its own. */}
                        {/* <div className="flex-shrink-0 overflow-y-auto max-h-[50%]"> */}
                        <div
                          className={`flex-shrink-0 overflow-y-auto ${isSkillTab ? 'max-h-[100%]' : 'h-full'}`}
                        >
                          {isSkillTab ? (
                            executing && !result ? (
                              <div className="px-5 py-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                                <Loader2 size={14} className="animate-spin" /> Loading skill
                                content…
                              </div>
                            ) : null
                          ) : (
                            /* Callable tools: parameter form */
                            (() => {
                              const props = selectedTool.parameters?.properties ?? {};
                              const required = selectedTool.parameters?.required ?? [];
                              const keys = Object.keys(props);
                              if (keys.length === 0) {
                                return (
                                  <div className="px-5 py-4">
                                    <p className="text-sm text-gray-400 dark:text-gray-500 mb-3">
                                      This tool takes no parameters.
                                    </p>
                                    <button
                                      onClick={handleSubmit}
                                      disabled={executing}
                                      className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-600 transition-colors"
                                    >
                                      {executing ? (
                                        <Loader2 size={14} className="animate-spin" />
                                      ) : (
                                        <Play size={14} />
                                      )}
                                      {executing ? 'Running...' : 'Run Tool'}
                                    </button>
                                  </div>
                                );
                              }
                              return (
                                <div className="px-5 py-4 space-y-3">
                                  {keys.map((key) => (
                                    <div key={key}>
                                      <label className="block text-sm font-600 text-gray-700 dark:text-gray-300 mb-1">
                                        {key}
                                        {required.includes(key) && (
                                          <span className="text-red-400 ml-1">*</span>
                                        )}
                                        {props[key]?.description && (
                                          <span className="ml-2 text-sm font-normal text-gray-400 dark:text-gray-500">
                                            {props[key].description}
                                          </span>
                                        )}
                                      </label>
                                      {props[key]?.enum ? (
                                        <select
                                          value={formValues[key] ?? ''}
                                          onChange={(e) =>
                                            setFormValues((prev) => ({
                                              ...prev,
                                              [key]: e.target.value,
                                            }))
                                          }
                                          className="w-full h-9 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 rounded-lg border border-gray-200 dark:border-gray-600 text-sm focus:outline-none focus:border-amber-500"
                                        >
                                          <option value="">— select —</option>
                                          {props[key].enum!.map((opt) => (
                                            <option key={opt} value={opt}>
                                              {opt}
                                            </option>
                                          ))}
                                        </select>
                                      ) : props[key]?.type === 'array' ||
                                        props[key]?.type === 'object' ? (
                                        <textarea
                                          value={formValues[key] ?? ''}
                                          onChange={(e) =>
                                            setFormValues((prev) => ({
                                              ...prev,
                                              [key]: e.target.value,
                                            }))
                                          }
                                          rows={3}
                                          placeholder={
                                            props[key]?.type === 'array'
                                              ? 'JSON array, one entry per line, or a single value'
                                              : 'JSON object'
                                          }
                                          className="w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm focus:outline-none focus:border-amber-500 font-mono resize-y"
                                        />
                                      ) : (
                                        <input
                                          value={formValues[key] ?? ''}
                                          onChange={(e) =>
                                            setFormValues((prev) => ({
                                              ...prev,
                                              [key]: e.target.value,
                                            }))
                                          }
                                          placeholder={props[key]?.type ?? 'string'}
                                          className="w-full h-9 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 rounded-lg border border-gray-200 dark:border-gray-600 text-sm focus:outline-none focus:border-amber-500 font-mono"
                                        />
                                      )}
                                    </div>
                                  ))}
                                  <button
                                    onClick={handleSubmit}
                                    disabled={executing}
                                    className="flex items-center gap-1.5 px-4 h-9 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-600 transition-colors"
                                  >
                                    {executing ? (
                                      <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                      <Play size={14} />
                                    )}
                                    {executing ? 'Running...' : 'Run Tool'}
                                  </button>
                                </div>
                              );
                            })()
                          )}
                          {/* Result */}
                          {execError && (
                            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm font-mono whitespace-pre-wrap break-all">
                              <div className="flex items-center gap-1.5 mb-1 text-sm font-600">
                                <XCircle size={14} /> Error
                              </div>
                              {execError}
                            </div>
                          )}
                          {result !== null && !execError && (
                            // Layout differs by tab:
                            // • Skills — we want the green box to claim the
                            //   remaining height so its inner <pre> can scroll
                            //   a long SKILL.md body inside the border.
                            // • Callable tools — the result is usually small,
                            //   so the box hugs its content (no flex-1) and
                            //   the <pre> uses a fixed max-h-64 like before.
                            <div
                              className={
                                isSkillTab
                                  ? 'mx-5 mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex flex-col flex-1 min-h-0 max-h-full'
                                  : 'mx-5 mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800'
                              }
                            >
                              <div className="flex items-center gap-1.5 mb-1 text-sm font-600 text-emerald-700 dark:text-emerald-300 flex-shrink-0">
                                <CheckCircle2 size={14} />{' '}
                                {isSkillTab
                                  ? 'Skill Content (injected into system prompt)'
                                  : 'Result'}
                              </div>
                              {/* Skills: render SKILL.md content as preformatted text */}
                              {isSkillTab &&
                              typeof result === 'object' &&
                              result !== null &&
                              'content' in result ? (
                                <div className="flex flex-col flex-1 min-h-0">
                                  <p className="text-sm text-emerald-600 dark:text-emerald-400 mb-2 flex-shrink-0">
                                    {(result as { note?: string }).note}
                                  </p>
                                  <pre className="text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words bg-white dark:bg-gray-900 rounded p-3 border border-gray-200 dark:border-gray-700 flex-1 min-h-0 overflow-y-auto">
                                    {(result as { content: string }).content}
                                  </pre>
                                </div>
                              ) : (
                                <JsonView
                                  value={result}
                                  stringPassthrough
                                  initialDepth={2}
                                  maxHeight="max-h-64"
                                />
                              )}
                            </div>
                          )}
                        </div>
                        {/* end form/loader region */}
                      </div>
                      {/* end scrollable content */}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
                      <Wrench size={32} className="mb-3 opacity-40" />
                      <p className="text-sm">Select a tool from the left panel</p>
                      <p className="text-sm mt-1 opacity-60">
                        Choose a category tab, then click a tool to test it
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {/* end max-w-6xl */}
        </div>
      </div>
    </main>
  );
}
