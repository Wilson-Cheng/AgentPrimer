'use client';

/**
 * app/skills/page.tsx
 * ---------------------------------------------------------------------------
 * Skills & MCP — shows all 4 categories of agent capabilities:
 *
 *   1. Skills (SKILL.md) — instruction modules injected into system prompt
 *   2. Function Tools (function.json + index.js) — OpenAI function-calling
 *   3. MCP Servers — Model Context Protocol servers
 *   4. Built-in Tools — in-process TypeScript tools
 *
 * Each category shows what's available, allows enable/disable toggling,
 * and links to the Tool Playground for interactive testing.
 */

import { useState, useEffect, useCallback } from 'react';
import Button from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import { useConfirm } from '@/components/ui/CustomConfirmDialog';
import {
  Zap,
  Server,
  Plus,
  Trash2,
  GitBranch,
  RefreshCw,
  Pencil,
  AlertCircle,
  Terminal,
  ShieldAlert,
  HardDrive,
  Brain,
  Bot,
  PackageOpen,
  Code2,
  Loader2,
  FunctionSquare,
  BookOpen,
} from 'lucide-react';

import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Skill {
  id: string | null;
  name: string;
  github_url: string;
  local_path?: string;
  enabled: number;
  registered: boolean;
  description?: string;
  manifest_preview?: string;
  manifest?: Record<string, unknown>;
  type?: string;
  source?: string;
}

interface McpServer {
  id: string;
  name: string;
  github_url: string;
  transport: 'stdio' | 'sse';
  command: string;
  args_json: string;
  url: string;
  enabled: number;
  /** Names of env vars currently set on this server (values not returned). */
  env_keys?: string[];
  /** True when env_json could not be parsed (corrupted row). */
  env_parse_error?: boolean;
}

type Tab = 'skills' | 'function_tools' | 'mcp' | 'builtin';

/**
 * Parse a textarea full of `KEY=value` lines into an object suitable for
 * `POST /api/mcp { env }`. The server runs its own `sanitizeEnvInput` on
 * top of this, so all we need to do here is be liberal with whitespace and
 * skip obvious junk (blank lines, comments starting with `#`).
 *
 * Lines without an `=` are ignored. Surrounding quotes around the value
 * are stripped so users can paste `GITHUB_TOKEN="ghp_…"` and have it work.
 */
function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }
    if (!key || !val) continue;
    out[key] = val;
  }
  return out;
}

type BuiltinCategory = 'filesystem' | 'memory' | 'agent' | 'shell' | 'output';

interface BuiltinTool {
  id: string;
  label: string;
  description: string;
  category: BuiltinCategory;
  dangerous?: boolean;
  defaultEnabled: boolean;
  enabled: boolean;
}

export default function SkillsPage() {
  const { showConfirm, ConfirmModal } = useConfirm();
  const [tab, setTab] = useState<Tab>('skills');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [functionTools, setFunctionTools] = useState<Skill[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [builtinTools, setBuiltinTools] = useState<BuiltinTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [installModal, setInstallModal] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [mcpTransport, setMcpTransport] = useState<'stdio' | 'sse'>('stdio');
  const [mcpCommand, setMcpCommand] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  // Per-server env vars for the install dialog. One KEY=value per line.
  // Persisted on `mcp_servers.env_json` so the credential only ever reaches
  // this one MCP server's subprocess (see lib/mcp-client.ts).
  const [mcpEnvText, setMcpEnvText] = useState('');
  const [editMcp, setEditMcp] = useState<McpServer | null>(null);
  const [editMcpName, setEditMcpName] = useState('');
  const [editMcpTransport, setEditMcpTransport] = useState<'stdio' | 'sse'>('stdio');
  const [editMcpCommand, setEditMcpCommand] = useState('');
  const [editMcpUrl, setEditMcpUrl] = useState('');
  // The edit dialog never receives the existing env values back from the
  // server (the API masks them). If the user leaves this textarea blank the
  // existing env is preserved untouched; if they type at least one line the
  // whole env map is replaced. `mcpEnvKeys` is just for the "currently
  // configured: X, Y" hint so the user can see what's set.
  const [editMcpEnvText, setEditMcpEnvText] = useState('');
  const [editMcpEnvKeys, setEditMcpEnvKeys] = useState<string[]>([]);
  const [editMcpEnvParseError, setEditMcpEnvParseError] = useState(false);
  const [editMcpError, setEditMcpError] = useState('');
  const [savingMcp, setSavingMcp] = useState(false);

  // Shared fetch – no sync setState, safe from useEffect
  const doRefresh = async () => {
    try {
      const [skillsRes, fnRes, mcpRes, builtinRes] = await Promise.all([
        fetch('/api/skills'),
        fetch('/api/function-tools'),
        fetch('/api/mcp'),
        fetch('/api/builtin-tools'),
      ]);
      const skillsData = await skillsRes.json();
      const fnData = await fnRes.json();
      const mcpData = await mcpRes.json();
      const builtinData = await builtinRes.json();
      setSkills(skillsData.skills ?? []);
      setFunctionTools(fnData.functionTools ?? []);
      setMcpServers(mcpData.servers ?? []);
      setBuiltinTools(builtinData.tools ?? []);
    } finally {
      setLoading(false);
    }
  };

  // Same as doRefresh() but without touching the loading state — used by
  // toggle handlers so the list doesn't flash a spinner on every click.
  const fetchData = async () => {
    try {
      const [skillsRes, fnRes, mcpRes, builtinRes] = await Promise.all([
        fetch('/api/skills'),
        fetch('/api/function-tools'),
        fetch('/api/mcp'),
        fetch('/api/builtin-tools'),
      ]);
      const skillsData = await skillsRes.json();
      const fnData = await fnRes.json();
      const mcpData = await mcpRes.json();
      const builtinData = await builtinRes.json();
      setSkills(skillsData.skills ?? []);
      setFunctionTools(fnData.functionTools ?? []);
      setMcpServers(mcpData.servers ?? []);
      setBuiltinTools(builtinData.tools ?? []);
    } catch {
      // silent — errors are transient
    }
  };

  // Manual refresh button shows loading spinner
  const refresh = () => {
    setLoading(true);
    doRefresh();
  };

  // Initial load
  useEffect(() => {
    doRefresh();
  }, []);

  const handleInstall = async () => {
    if (tab === 'skills' && !githubUrl) return;
    if (tab === 'function_tools' && !githubUrl) return;
    if (tab === 'mcp' && !mcpCommand && mcpTransport !== 'sse') return;
    setInstalling(true);
    setInstallError('');

    const url =
      tab === 'skills'
        ? '/api/skills'
        : tab === 'function_tools'
          ? '/api/function-tools'
          : '/api/mcp';
    let body: Record<string, unknown>;
    if (tab === 'mcp') {
      // Only attach `env` when the user actually typed something AND the
      // transport will use it. SSE servers never receive env from us.
      const env = mcpTransport === 'stdio' ? parseEnvText(mcpEnvText) : {};
      body = {
        transport: mcpTransport,
        command: mcpCommand || undefined,
        url: mcpUrl || undefined,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };
    } else {
      body = { githubUrl };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      setInstallError(data.error ?? 'Installation failed');
    } else {
      setInstallModal(false);
      setGithubUrl('');
      setMcpCommand('');
      setMcpUrl('');
      setMcpEnvText('');
      refresh();
    }
    setInstalling(false);
  };

  const openEditMcp = (server: McpServer) => {
    const args = JSON.parse(server.args_json || '[]') as string[];
    setEditMcp(server);
    setEditMcpName(server.name);
    setEditMcpTransport(server.transport);
    setEditMcpCommand(
      server.transport === 'stdio' ? [server.command, ...args].filter(Boolean).join(' ') : '',
    );
    setEditMcpUrl(server.url || '');
    setEditMcpEnvText('');
    setEditMcpEnvKeys(server.env_keys ?? []);
    setEditMcpEnvParseError(!!server.env_parse_error);
    setEditMcpError('');
  };

  const handleSaveMcp = async () => {
    if (!editMcp) return;
    // Warn before toggling a stdio server (that has env configured) to SSE.
    // The credentials are preserved on the server side (we no longer wipe
    // env_json on transport change), but the operator should know that the
    // SSE transport will not forward any env to the remote server.
    if (
      editMcp.transport === 'stdio' &&
      editMcpTransport === 'sse' &&
      editMcpEnvKeys.length > 0 &&
      typeof window !== 'undefined'
    ) {
      const confirmed = window.confirm(
        `This server currently has ${editMcpEnvKeys.length} env var(s) configured ` +
          `(${editMcpEnvKeys.join(', ')}). Switching to SSE transport means none of those ` +
          `values will reach the remote server — SSE is network-accessed and AgentPrimer ` +
          `cannot inject env into it. The values remain saved in case you switch back to stdio. ` +
          `Continue?`,
      );
      if (!confirmed) return;
    }
    setSavingMcp(true);
    setEditMcpError('');
    const parts = editMcpCommand.trim().split(/\s+/).filter(Boolean);
    // Only send `env` when the user actually edited the textarea. A blank
    // textarea means "leave the existing env_json alone"; typing anything
    // (even a single blank-after-trim entry) means "replace the entire
    // env map with what I just typed".
    const envSubmitted = editMcpEnvText.trim().length > 0;
    const env =
      editMcpTransport === 'stdio' && envSubmitted ? parseEnvText(editMcpEnvText) : undefined;
    const body =
      editMcpTransport === 'stdio'
        ? {
            id: editMcp.id,
            name: editMcpName,
            transport: editMcpTransport,
            command: parts[0] ?? '',
            args: parts.slice(1),
            ...(env !== undefined ? { env } : {}),
          }
        : {
            id: editMcp.id,
            name: editMcpName,
            transport: editMcpTransport,
            url: editMcpUrl.trim(),
            // Intentionally do NOT send `env: {}` here — that would clobber
            // the saved values. Switching to SSE preserves them on the
            // server side so a later switch back to stdio doesn't require
            // the operator to re-enter every credential.
          };
    const res = await fetch('/api/mcp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSavingMcp(false);
    if (!res.ok) {
      setEditMcpError((data as { error?: string }).error ?? 'Failed to update MCP server.');
      return;
    }
    setEditMcp(null);
    fetchData();
  };

  /** Toggle a skill (SKILL.md) on/off */
  const handleToggleSkill = async (skill: Skill) => {
    if (skill.id) {
      await fetch('/api/skills', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: skill.id, enabled: !skill.enabled }),
      });
    } else if (skill.local_path) {
      await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localPath: skill.local_path, enabled: true }),
      });
    }
    fetchData(); // silent refresh — no loading flash
  };

  /** Toggle a function tool on/off */
  const handleToggleFnTool = async (ft: Skill) => {
    if (ft.id) {
      await fetch('/api/function-tools', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ft.id, enabled: !ft.enabled }),
      });
    } else if (ft.local_path) {
      await fetch('/api/function-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localPath: ft.local_path, name: ft.name }),
      });
    }
    fetchData();
  };

  /** Toggle an MCP server on/off */
  const handleToggleMcp = async (id: string, current: number) => {
    await fetch('/api/mcp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !current }),
    });
    fetchData();
  };

  /** Toggle a built-in tool on/off */
  const handleToggleBuiltin = async (id: string, current: boolean) => {
    await fetch('/api/builtin-tools', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !current }),
    });
    setBuiltinTools((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !current } : t)));
  };

  const handleDeleteSkill = async (id: string) => {
    const ok = await showConfirm('This skill will be unregistered.', {
      title: 'Remove skill?',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    await fetch(`/api/skills?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleDeleteFnTool = async (id: string) => {
    const ok = await showConfirm('This function tool will be unregistered.', {
      title: 'Remove function tool?',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    await fetch(`/api/function-tools?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const handleDeleteMcp = async (id: string) => {
    const ok = await showConfirm('The MCP server and all its files will be permanently removed.', {
      title: 'Uninstall MCP server?',
      confirmLabel: 'Uninstall',
    });
    if (!ok) return;
    await fetch(`/api/mcp?id=${id}`, { method: 'DELETE' });
    fetchData();
  };

  const tabs = [
    {
      key: 'skills' as Tab,
      icon: <BookOpen size={16} />,
      label: 'Skills',
      count: skills.length,
      desc: 'SKILL.md instruction modules - Edit or Create new in Agent Files > skills folder',
    },
    {
      key: 'function_tools' as Tab,
      icon: <FunctionSquare size={16} />,
      label: 'Function Tools',
      count: functionTools.length,
      desc: 'Function-calling tools — Edit or Create new in Agent Files > function-tools folder',
    },
    {
      key: 'mcp' as Tab,
      icon: <Server size={16} />,
      label: 'MCP Servers',
      count: mcpServers.length,
      desc: 'Model Context Protocol servers - Use external MCP servers or create new in Agent Files > mcp-servers',
    },
    {
      key: 'builtin' as Tab,
      icon: <Terminal size={16} />,
      label: 'Built-in Tools',
      count: builtinTools.filter((t) => t.enabled).length,
      desc: "AgentPrimer's built-in core function-calling capabilities — disable any you don't need",
    },
  ];

  return (
    <>
      {ConfirmModal}
      <main className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-950">
        {/* Header — sticks at top */}
        <div className="flex-shrink-0 bg-emerald-600 pl-14 pr-6 py-6 md:px-8 md:py-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-1/2 w-48 h-48 bg-black/10 rotate-45 translate-x-12 translate-y-12" />
          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-12 w-12 min-w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Zap size={24} className="text-white" />
                </div>
                <div className="min-w-0 overflow-hidden">
                  <h1 className="text-3xl font-800 text-white tracking-tight truncate">
                    Skills &amp; MCP
                  </h1>
                  <p className="text-emerald-100 text-sm truncate">
                    Skills, function tools, MCP servers, and built-in tools
                  </p>
                </div>
              </div>
              {tab !== 'builtin' && (
                <Button variant="primary" onClick={() => setInstallModal(true)} className="gap-2">
                  <Plus size={16} /> Install
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs row — sticks below header */}
        <div className="flex-shrink-0 w-full max-w-3xl mx-auto px-4 md:px-8 pt-4 md:pt-6">
          <div className="overflow-x-auto pb-1 -mx-1 px-1">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 w-max min-w-full md:min-w-0 md:w-fit mx-auto">
              {tabs.map(({ key, icon, label, count }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-600 transition-all duration-150 whitespace-nowrap ${
                    tab === key
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {icon}
                  {label}
                  <span
                    className={`text-sm rounded-full px-1.5 py-0.5 ${
                      tab === key
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable content area — full-width scrollbar at browser edge */}
        <div className="flex-1 overflow-y-auto">
          <div className="pt-2 max-w-3xl mx-auto w-full px-4 md:px-8 pb-6">
            {/* Contextual hint for active tab */}
            <div className="mb-4 px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-sm text-blue-700 dark:text-blue-300">
              {tabs.find((t) => t.key === tab)?.desc}
            </div>

            {loading ? (
              <div className="flex items-center gap-3 text-gray-400 dark:text-gray-500 py-16 justify-center">
                <RefreshCw size={18} className="animate-spin" />
                <span>Loading…</span>
              </div>
            ) : tab === 'skills' ? (
              <SkillsList
                skills={skills}
                onToggle={handleToggleSkill}
                onDelete={handleDeleteSkill}
              />
            ) : tab === 'function_tools' ? (
              <SkillsList
                skills={functionTools}
                onToggle={handleToggleFnTool}
                onDelete={handleDeleteFnTool}
                isFnTools
              />
            ) : tab === 'mcp' ? (
              <McpList
                servers={mcpServers}
                onToggle={handleToggleMcp}
                onDelete={handleDeleteMcp}
                onEdit={openEditMcp}
              />
            ) : (
              <BuiltinToolsList tools={builtinTools} onToggle={handleToggleBuiltin} />
            )}
          </div>
          {/* end inner centered content */}
        </div>
        {/* end outer scroll container */}
      </main>

      {/* Edit MCP Modal */}
      <Modal
        open={!!editMcp}
        onClose={() => {
          setEditMcp(null);
          setEditMcpError('');
        }}
        title="Edit MCP Server"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditMcp(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveMcp} loading={savingMcp}>
              Save changes
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-600 text-gray-700 dark:text-gray-300">Name</label>
            <input
              type="text"
              value={editMcpName}
              onChange={(e) => setEditMcpName(e.target.value)}
              className="w-full h-11 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-600 text-gray-700 dark:text-gray-300">Transport</label>
            <div className="flex gap-3">
              {(['stdio', 'sse'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEditMcpTransport(t)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-600 border-2 transition-all duration-150 ${editMcpTransport === t ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700'}`}
                >
                  {t === 'stdio' ? '⟳ stdio' : '🌐 HTTP/SSE'}
                </button>
              ))}
            </div>
          </div>
          {editMcpTransport === 'stdio' ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                  Start Command
                </label>
                <input
                  type="text"
                  value={editMcpCommand}
                  onChange={(e) => setEditMcpCommand(e.target.value)}
                  placeholder="npx -y exa-mcp-server"
                  className="w-full h-11 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200 font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                  Environment variables
                  <span className="ml-2 text-xs font-400 text-gray-500 dark:text-gray-400">
                    (per-server, KEY=value per line)
                  </span>
                </label>
                <textarea
                  value={editMcpEnvText}
                  onChange={(e) => setEditMcpEnvText(e.target.value)}
                  placeholder={'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx\nBRAVE_API_KEY=...'}
                  rows={4}
                  className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200 font-mono"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Values are write-only and never sent back to the browser.{' '}
                  {editMcpEnvParseError ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      ⚠ The saved env data could not be parsed. Re-enter the env vars below to
                      replace it.
                    </span>
                  ) : editMcpEnvKeys.length > 0 ? (
                    <>
                      Currently configured:{' '}
                      <code className="font-mono">{editMcpEnvKeys.join(', ')}</code>. Leave blank to
                      keep them as-is, or type at least one line to replace them.
                    </>
                  ) : (
                    <>No env vars are currently set for this server.</>
                  )}
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                Server URL
              </label>
              <input
                type="url"
                value={editMcpUrl}
                onChange={(e) => setEditMcpUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="w-full h-11 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Per-server environment variables only apply to <code>stdio</code> transport. SSE
                servers receive no env from AgentPrimer.
              </p>
            </div>
          )}
          {editMcpError && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              {editMcpError}
            </div>
          )}
        </div>
      </Modal>

      {/* Install Modal */}
      <Modal
        open={installModal}
        onClose={() => {
          setInstallModal(false);
          setInstallError('');
          setGithubUrl('');
          setMcpEnvText('');
        }}
        title={
          tab === 'skills'
            ? 'Install Skill'
            : tab === 'function_tools'
              ? 'Install Function Tool'
              : 'Install MCP Server'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setInstallModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleInstall} loading={installing}>
              {tab === 'skills'
                ? 'Install'
                : tab === 'function_tools'
                  ? 'Install'
                  : 'Install Server'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {(tab === 'skills' || tab === 'function_tools') && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                GitHub Repository URL
              </label>
              <div className="relative">
                <GitBranch
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="url"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  className="w-full h-11 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 pl-10 pr-4 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200"
                />
              </div>
            </div>
          )}

          {tab === 'mcp' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                  Transport
                </label>
                <div className="flex gap-3">
                  {(['stdio', 'sse'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMcpTransport(t)}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-600 border-2 transition-all duration-150 ${mcpTransport === t ? 'border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700'}`}
                    >
                      {t === 'stdio' ? '⟳ stdio' : '🌐 HTTP/SSE'}
                    </button>
                  ))}
                </div>
              </div>
              {mcpTransport === 'stdio' ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                      Start Command
                    </label>
                    <input
                      type="text"
                      value={mcpCommand}
                      onChange={(e) => setMcpCommand(e.target.value)}
                      placeholder="npx -y exa-mcp-server"
                      className="w-full h-11 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200 font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                      Environment variables
                      <span className="ml-2 text-xs font-400 text-gray-500 dark:text-gray-400">
                        (optional, KEY=value per line)
                      </span>
                    </label>
                    <textarea
                      value={mcpEnvText}
                      onChange={(e) => setMcpEnvText(e.target.value)}
                      placeholder={'GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx\nBRAVE_API_KEY=...'}
                      rows={4}
                      className="w-full bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 py-2 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200 font-mono"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Only this server&apos;s subprocess receives these. AgentPrimer&apos;s host env
                      (provider API keys, AGENT_PRIMER_SECRET, …) is not forwarded by default.
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-600 text-gray-700 dark:text-gray-300">
                    Server URL
                  </label>
                  <input
                    type="url"
                    value={mcpUrl}
                    onChange={(e) => setMcpUrl(e.target.value)}
                    placeholder="http://localhost:3001"
                    className="w-full h-11 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 px-3 rounded-lg border-2 border-transparent text-sm focus:outline-none focus:bg-white dark:focus:bg-gray-600 focus:border-blue-500 transition-all duration-200"
                  />
                </div>
              )}
            </>
          )}

          {installError && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              {installError}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Generic list component — used for Skills (SKILL.md) and Function Tools
// ---------------------------------------------------------------------------
function SkillsList({
  skills,
  onToggle,
  onDelete,
  isFnTools,
}: {
  skills: Skill[];
  onToggle: (s: Skill) => void;
  onDelete: (id: string) => void;
  isFnTools?: boolean;
}) {
  if (skills.length === 0) {
    const toolType = isFnTools ? 'function tools' : 'skills';
    return (
      <EmptyState
        icon={
          isFnTools ? (
            <FunctionSquare size={32} className="text-gray-400" />
          ) : (
            <BookOpen size={32} className="text-gray-400" />
          )
        }
        title={`No ${toolType} registered`}
        description={
          isFnTools
            ? 'Function tools are callable OpenAI functions defined in data/function-tools/<name>/. The server runs index.js in a subprocess when the model calls them.'
            : 'Skills are instruction modules following the agentskills.io SKILL.md standard. Content is injected into the agent system prompt.'
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {skills.map((skill) => {
        const isOn = !!skill.enabled;
        return (
          <div
            key={skill.id ?? skill.name}
            className={`rounded-xl p-5 border-2 transition-all duration-150 ${
              isOn
                ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30'
                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 min-w-0">
                <div
                  className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isOn ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  {isFnTools ? (
                    <FunctionSquare size={18} className="text-white" />
                  ) : (
                    <BookOpen size={18} className="text-white" />
                  )}
                </div>
                <div className="min-w-0 overflow-hidden">
                  <p className="font-700 text-gray-900 dark:text-gray-100 truncate">{skill.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                    {skill.description ||
                      (isFnTools ? 'OpenAI function-calling tool' : 'SKILL.md instruction module')}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <span
                      className={`text-sm font-600 px-1.5 py-0.5 rounded-full ${
                        isFnTools
                          ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400'
                          : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {isFnTools ? 'function tool' : 'skill'}
                    </span>
                    {skill.source && (
                      <span className="text-sm text-gray-400 dark:text-gray-500">
                        {skill.source}
                      </span>
                    )}
                    {skill.registered && (
                      <a
                        href={skill.github_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1 truncate"
                      >
                        <GitBranch size={12} />
                        {skill.github_url}
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <Toggle checked={isOn} onChange={() => onToggle(skill)} />
                {skill.id && (
                  <button
                    onClick={() => onDelete(skill.id!)}
                    className="p-2 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 transition-all duration-150"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex justify-end mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
              <a
                href={isFnTools ? `/tools?tab=function_tool` : `/tools?tab=skills`}
                className="flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors"
              >
                <Code2 size={14} />
                test in playground ›
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MCP Server list component
// ---------------------------------------------------------------------------
function McpList({
  servers,
  onToggle,
  onDelete,
  onEdit,
}: {
  servers: McpServer[];
  onToggle: (id: string, current: number) => void;
  onDelete: (id: string) => void;
  onEdit: (server: McpServer) => void;
}) {
  if (servers.length === 0) {
    return (
      <EmptyState
        icon={<Server size={32} className="text-gray-400" />}
        title="No MCP servers installed"
        description="Install an MCP server from a GitHub repository to add protocol-based tools."
      />
    );
  }

  return (
    <div className="space-y-4">
      {servers.map((server) => (
        <div
          key={server.id}
          className={`rounded-xl p-5 border-2 transition-all duration-150 ${server.enabled ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30' : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${server.enabled ? 'bg-blue-500' : 'bg-gray-300'}`}
              >
                <Server size={18} className="text-white" />
              </div>
              <div>
                <p className="font-700 text-gray-900 dark:text-gray-100">{server.name}</p>
                <div className="flex items-center gap-2 mt-1 w-full flex-col items-start md:flex-row md:items-center">
                  <span
                    className={`text-sm font-600 px-2 py-0.5 rounded-full w-20 ${server.transport === 'stdio' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}
                  >
                    {server.transport === 'stdio' ? '⟳ stdio' : '🌐 SSE'}
                  </span>
                  {server.transport === 'stdio' && server.command && (
                    <code className="break-all md:break-normal text-sm bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded font-mono">
                      {[server.command, ...(JSON.parse(server.args_json || '[]') as string[])].join(
                        ' ',
                      )}
                    </code>
                  )}
                  {server.transport === 'sse' && server.url && (
                    <code className="break-all md:break-normal text-sm bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded font-mono">
                      {server.url}
                    </code>
                  )}
                </div>
                {server.github_url && (
                  <a
                    href={server.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-500 hover:text-blue-600 flex items-center gap-1 mt-2"
                  >
                    <GitBranch size={14} /> {server.github_url}
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <Toggle
                checked={!!server.enabled}
                onChange={() => onToggle(server.id, server.enabled)}
              />
              <button
                onClick={() => onEdit(server)}
                className="p-2 rounded-lg text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-blue-500 transition-all duration-150"
                title="Edit MCP server"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => onDelete(server.id)}
                className="p-2 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 transition-all duration-150"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <div className="flex justify-end mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
            <a
              href="/tools?tab=mcp"
              className="flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors"
            >
              <Code2 size={14} />
              test in playground ›
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Built-in tools list component
// ---------------------------------------------------------------------------

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  shell: { label: 'Shell', icon: <Terminal size={14} />, color: 'text-red-500' },
  filesystem: { label: 'Filesystem', icon: <HardDrive size={14} />, color: 'text-blue-500' },
  memory: { label: 'Memory', icon: <Brain size={14} />, color: 'text-purple-500' },
  agent: { label: 'Agent', icon: <Bot size={14} />, color: 'text-emerald-500' },
  output: { label: 'Output', icon: <PackageOpen size={14} />, color: 'text-amber-500' },
  skill: { label: 'Skill', icon: <BookOpen size={14} />, color: 'text-indigo-500' },
};

// ---------------------------------------------------------------------------
// BuiltinToolCard – single tool row with collapsible source viewer
// ---------------------------------------------------------------------------
function BuiltinToolCard({
  tool,
  onToggle,
}: {
  tool: BuiltinTool;
  onToggle: (id: string, current: boolean) => void;
}) {
  const [sourceOpen, setSourceOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, { attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const handleViewSource = useCallback(async () => {
    if (sourceOpen) {
      setSourceOpen(false);
      return;
    }
    setSourceOpen(true);
    if (source !== null) return; // already fetched
    setSourceLoading(true);
    try {
      const res = await fetch(`/api/builtin-tools/source?id=${encodeURIComponent(tool.id)}`);
      const data = await res.json();
      setSource(res.ok ? (data.snippet ?? '// not found') : '// could not load source');
    } catch {
      setSource('// could not load source');
    } finally {
      setSourceLoading(false);
    }
  }, [sourceOpen, source, tool.id]);

  return (
    <div
      className={`rounded-xl border-2 transition-colors duration-150 overflow-hidden ${
        tool.dangerous
          ? tool.enabled
            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
          : tool.enabled
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20'
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
      }`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={`h-9 w-9 rounded-lg min-w-9 flex items-center justify-center flex-shrink-0 ${
                tool.dangerous
                  ? tool.enabled
                    ? 'bg-red-500'
                    : 'bg-gray-300 dark:bg-gray-600'
                  : tool.enabled
                    ? 'bg-emerald-500'
                    : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              {tool.dangerous ? (
                <ShieldAlert size={16} className="text-white" />
              ) : (
                <Zap size={16} className="text-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-700 text-gray-900 dark:text-gray-100 text-md">{tool.label}</p>
                {tool.dangerous && (
                  <span className="text-sm font-600 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex items-center gap-1">
                    <ShieldAlert size={16} /> Dangerous
                  </span>
                )}
                {!tool.defaultEnabled && (
                  <span className="text-sm font-600 px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                    Off by default
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
                {tool.description}
              </p>
              <code className="text-sm text-gray-400 dark:text-gray-500 font-mono mt-1 block">
                {tool.id}
              </code>
            </div>
          </div>
          <Toggle checked={tool.enabled} onChange={() => onToggle(tool.id, tool.enabled)} />
        </div>

        {/* View / close source link */}
        <div className="flex justify-end mt-2">
          <button
            onClick={handleViewSource}
            className="flex items-center gap-1 text-sm text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors"
          >
            <Code2 size={16} />
            {sourceOpen ? 'close source' : 'view source'}
          </button>
        </div>
      </div>

      {/* Source code panel */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${sourceOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-4 py-3">
            {sourceLoading ? (
              <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                <Loader2 size={14} className="animate-spin" /> Loading source…
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto overflow-x-auto text-sm">
                <SyntaxHighlighter
                  language="typescript"
                  style={isDark ? oneDark : oneLight}
                  customStyle={{
                    margin: 0,
                    background: 'transparent',
                    padding: 0,
                    fontSize: 'inherit',
                  }}
                  wrapLongLines={false}
                  wrapLines={true}
                  lineProps={{ style: { background: 'transparent', display: 'block' } }}
                >
                  {source ?? ''}
                </SyntaxHighlighter>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BuiltinToolsList({
  tools,
  onToggle,
}: {
  tools: BuiltinTool[];
  onToggle: (id: string, current: boolean) => void;
}) {
  const grouped = tools.reduce<Record<string, BuiltinTool[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t);
    return acc;
  }, {});

  const categoryOrder: BuiltinTool['category'][] = [
    'shell',
    'output',
    'filesystem',
    'memory',
    'agent',
  ];

  return (
    <div className="space-y-8">
      {/* Warning banner */}
      {/* <div className="flex gap-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <ShieldAlert size={16} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <p>
          Built-in tools are available to the agent in every conversation. Disable tools you don&apos;t need.
        </p>
      </div> */}

      {categoryOrder
        .filter((cat) => grouped[cat]?.length)
        .map((cat) => {
          const meta = CATEGORY_META[cat] ?? {
            label: cat,
            icon: <Zap size={14} />,
            color: 'text-gray-500',
          };
          return (
            <div key={cat}>
              <div className={`flex items-center gap-2 mb-3 text-sm font-700 ${meta.color}`}>
                {meta.icon}
                {meta.label}
              </div>
              <div className="space-y-3">
                {grouped[cat].map((tool) => (
                  <BuiltinToolCard key={tool.id} tool={tool} onToggle={onToggle} />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-700 text-gray-900 dark:text-gray-100 text-lg mb-1">{title}</h3>
      <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm">{description}</p>
    </div>
  );
}
