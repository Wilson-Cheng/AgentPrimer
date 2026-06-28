'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Brain, Copy, Check, X, Loader2, FileText, Wrench, Code2, Lightbulb } from 'lucide-react';
import JsonView from './ui/JsonView';

interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface ToolSource {
  name: string;
  source: 'builtin' | 'function' | 'mcp';
}

interface SystemPromptData {
  agentName: string;
  systemBase: string;
  agentSystemPrompt: string;
  agentPath?: string;
  memory: string;
  memoryPath?: string;
  composed: string;
  isStructured: boolean;
  schemaLabel?: string;
  tools: ToolDef[];
  toolSources: ToolSource[];
  toolsLoaded: boolean;
  toolsError?: string;
  examplePayload: Record<string, unknown>;
}

type TabKey = 'composed' | 'source' | 'tools' | 'payload';

export default function SystemPromptModal({ agentName, sessionId, onClose }: {
  agentName: string;
  sessionId?: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<SystemPromptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('composed');
  // Lazy second fetch for tools — keeps modal-open latency tiny on agents
  // with slow/unreachable MCP servers, since the base prompt view never
  // depends on the tools assembly succeeding.
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsRequested, setToolsRequested] = useState(false);

  // First fetch: prompt + source files only (cheap, no MCP).
  useEffect(() => {
    const params = new URLSearchParams({ agent: agentName });
    if (sessionId) params.set('sessionId', sessionId);
    fetch(`/api/system-prompt?${params}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [agentName, sessionId]);

  // Second fetch (deferred): triggered the first time the user opens the
  // Tools or API Payload tab. Adds includeTools=1 so the server actually
  // assembles tool schemas (spawns MCP subprocesses, etc.).
  useEffect(() => {
    if (!toolsRequested || !data || data.toolsLoaded) return;
    setToolsLoading(true);
    const params = new URLSearchParams({ agent: agentName, includeTools: '1' });
    if (sessionId) params.set('sessionId', sessionId);
    fetch(`/api/system-prompt?${params}`)
      .then(r => r.json())
      .then((d: SystemPromptData) => {
        setData(prev => prev ? {
          ...prev,
          tools: d.tools,
          toolSources: d.toolSources,
          toolsLoaded: true,
          toolsError: d.toolsError,
          examplePayload: d.examplePayload,
        } : d);
        setToolsLoading(false);
      })
      .catch(e => {
        setData(prev => prev ? { ...prev, toolsError: e.message, toolsLoaded: true } : prev);
        setToolsLoading(false);
      });
  }, [toolsRequested, agentName, sessionId, data]);

  const handleTabSwitch = (tab: TabKey) => {
    setActiveTab(tab);
    if ((tab === 'tools' || tab === 'payload') && !toolsRequested) {
      setToolsRequested(true);
    }
  };

  // Splice the real tools array into the example payload at render time —
  // the server sends a "<see Tools tab>" placeholder so the same schemas
  // aren't serialized twice on the wire.
  const renderedPayload = useMemo(() => {
    if (!data) return null;
    if (data.examplePayload.tools === '<see Tools tab>' && data.tools.length > 0) {
      return { ...data.examplePayload, tools: data.tools };
    }
    return data.examplePayload;
  }, [data]);

  const handleCopy = () => {
    if (!data) return;
    let text = '';
    if (activeTab === 'composed') {
      text = data.composed;
    } else if (activeTab === 'source') {
      text = [
        `# System Prompt (${data.agentName})`,
        '',
        '## Global system.md',
        data.systemBase || '(empty)',
        '',
        `## Agent Config Prompt (${data.agentPath ?? `agents/${data.agentName}/agent.md`})`,
        data.agentSystemPrompt,
        '',
        `## Memory (${data.memoryPath ?? `agents/${data.agentName}/memory.md`})`,
        data.memory,
      ].join('\n\n');
    } else if (activeTab === 'tools') {
      text = JSON.stringify(data.tools, null, 2);
    } else if (activeTab === 'payload') {
      text = JSON.stringify(renderedPayload, null, 2);
    }
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sourceFor = (name: string): ToolSource['source'] | undefined =>
    data?.toolSources.find(s => s.name === name)?.source;

  const sourceBadgeStyles: Record<ToolSource['source'], string> = {
    builtin: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    function: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    mcp: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  };

  const toolsTabLabel = data
    ? data.toolsLoaded
      ? ` (${data.tools.length})`
      : toolsLoading
        ? ' …'
        : ''
    : '';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg min-w-9 bg-violet-500 flex items-center justify-center">
              <Brain size={18} className="text-white" />
            </div>
            <div>
              <h2 className="font-700 text-gray-900 dark:text-gray-100">Model Input</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Agent: <span className="font-mono">{agentName}</span>
                {data?.isStructured && (
                  <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-sm font-mono">
                    structured output{data.schemaLabel ? `: ${data.schemaLabel}` : ''}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              disabled={!data}
              className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 text-sm font-600 text-gray-700 dark:text-gray-300 transition-colors"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 pt-2 gap-4 flex-shrink-0 overflow-x-auto">
          <TabButton active={activeTab === 'composed'} onClick={() => handleTabSwitch('composed')}>
            Composed Prompt
          </TabButton>
          <TabButton active={activeTab === 'source'} onClick={() => handleTabSwitch('source')}>
            Source Files
          </TabButton>
          <TabButton active={activeTab === 'tools'} onClick={() => handleTabSwitch('tools')}>
            <Wrench size={12} className="inline mr-1 -mt-0.5" />
            Tools{toolsTabLabel}
          </TabButton>
          <TabButton active={activeTab === 'payload'} onClick={() => handleTabSwitch('payload')}>
            <Code2 size={12} className="inline mr-1 -mt-0.5" />
            API Payload
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
              Loading…
            </div>
          ) : error ? (
            <div className="text-red-500 py-4">{error}</div>
          ) : activeTab === 'composed' ? (
            <div className="space-y-3">
              <TipBanner>
                This is the <strong>full system message</strong>{' '}the model receives at the start of
                every turn. It&apos;s assembled from{' '}system prompt
                (<strong>system.md</strong>) + the active agent&apos;s
                prompt (<strong>agents/&lt;agent&gt;/agent.md</strong>) + the active agent&apos;s private memory + the{' '}
                description of available skills (see <strong>## Available Skills</strong>)
                + the output schema (if any). The skills section is generated from the discovery list. See the
                <em> Source Files</em> tab to inspect each piece individually.
              </TipBanner>
              <pre className="text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 max-h-[50vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
                {data!.composed || '(empty)'}
              </pre>
            </div>
          ) : activeTab === 'source' ? (
            <div className="space-y-6">
              <TipBanner>
                The source files below are concatenated (plus a few built-in sections) into the{' '}
                <em>Composed Prompt</em>. You can edit them in{' '}
                <Link
                  href="/agents"
                  onClick={onClose}
                  className="text-amber-700 dark:text-amber-300 font-semibold underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
                >
                  Prompts &amp; Memory
                </Link>{' '}
                — changes take effect on the next message.
              </TipBanner>
              <SourceSection label="system.md (System Prompt)" content={data!.systemBase || '(empty)'} />
              <SourceSection label={`${data!.agentPath ?? `agents/${agentName}/agent.md`} (Agent Prompt)`} content={data!.agentSystemPrompt} />
              <SourceSection label={`${data!.memoryPath ?? `agents/${agentName}/memory.md`} (Agent Memory)`} content={data!.memory} />
            </div>
          ) : activeTab === 'tools' ? (
            <div className="space-y-4">
              <TipBanner>
                These tool definitions are sent to the LLM via the OpenAI Chat Completions API in
                the <strong>tools</strong> object in the request field — <strong>separate</strong>{' '}
                from the system prompt. The model reads each{' '}
                <code className="font-mono">description</code> to decide <em>when</em> to call a
                tool, and the <code className="font-mono">parameters</code> JSON Schema to know{' '}
                <em>what</em> arguments to produce. Clear descriptions are the single highest-leverage
                way to improve tool-calling reliability.
              </TipBanner>
              {!data!.toolsLoaded ? (
                <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                  Loading tools…
                </div>
              ) : data!.toolsError ? (
                <div className="text-sm text-red-500 py-4">Failed to load tools: {data!.toolsError}</div>
              ) : data!.tools.length === 0 ? (
                <div className="text-sm text-gray-400 italic py-4">
                  No tools sent this turn{data!.isStructured ? ' (this structured-output agent has **Tools:** none in agent.md).' : '.'}
                </div>
              ) : (
                data!.tools.map(t => {
                  const src = sourceFor(t.function.name);
                  return (
                    <div
                      key={t.function.name}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 overflow-hidden"
                    >
                      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 min-w-0">
                          <Wrench size={14} className="text-gray-400 flex-shrink-0" />
                          <code className="text-sm font-mono font-700 text-gray-900 dark:text-gray-100 truncate">
                            {t.function.name}
                          </code>
                          {src && (
                            <span className={`text-sm font-mono uppercase tracking-wide px-1.5 py-0.5 rounded ${sourceBadgeStyles[src]}`}>
                              {src}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                          {t.function.description || <em className="text-gray-400">(no description)</em>}
                        </p>
                        <details className="text-sm">
                          <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 select-none">
                            parameters (JSON Schema)
                          </summary>
                          <div className="mt-2 bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <JsonView value={t.function.parameters} initialDepth={2} maxHeight="max-h-64" />
                          </div>
                        </details>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* payload */
            <div className="space-y-3">
              <TipBanner>
                This is the <strong>actual JSON body</strong> POSTed to{' '}
                <code className="font-mono">{'<endpoint>'}/v1/chat/completions</code> on the first
                turn. Notice how the system prompt lives inside{' '}
                <code className="font-mono">messages[0]</code> while tool schemas live in a separate{' '}
                <code className="font-mono">tools</code> field — both are part of the model&apos;s
                input context but are passed via different parts of the API request.
              </TipBanner>
              {!data!.toolsLoaded ? (
                <div className="flex items-center justify-center gap-2 py-12 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                  Loading payload…
                </div>
              ) : (
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                  <JsonView value={renderedPayload} initialDepth={Infinity} maxHeight="max-h-[55vh]" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-400 dark:text-gray-500 flex-shrink-0">
          Everything shown here — system prompt, tool schemas, and message history — is what the model sees
          on each turn.
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`pb-2 text-sm font-600 border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-violet-500 text-violet-600 dark:text-violet-400'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  );
}

function SourceSection({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <FileText size={14} className="text-gray-400" />
        <h3 className="text-sm font-600 text-gray-700 dark:text-gray-300">{label}</h3>
      </div>
      <pre className="text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700">
        {content || <em className="text-gray-400">(empty)</em>}
      </pre>
    </div>
  );
}

/**
 * Highlighted tip banner — used at the top of each tab to teach the user
 * what they're looking at. Amber palette signals "didactic note" without
 * looking like a warning. Inline code/strong tags inside `children` are
 * styled by their own classes; this wrapper only sets the surface.
 */
function TipBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-2.5 text-sm text-amber-900 dark:text-amber-100 leading-relaxed">
      <Lightbulb size={16} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
