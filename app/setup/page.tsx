'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, Globe, Cpu, RefreshCw, CheckCircle2,
  XCircle, ArrowRight, Eye, EyeOff, ArrowLeft, Search, Terminal,
} from 'lucide-react';
import CustomDropDown from '@/components/ui/CustomDropDown';

const steps = ['API', 'Web search', 'Shell'];

export default function SetupPage() {
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [testMsg, setTestMsg] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [exaKey, setExaKey] = useState('');
  const [showExaKey, setShowExaKey] = useState(false);
  const [enableShell, setEnableShell] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    fetch('/api/auth/setup')
      .then(r => r.json())
      .then(({ needsSetup }) => { if (needsSetup) router.replace('/register'); })
      .catch(() => { });
  }, [router]);

  const testConnection = async () => {
    setTesting(true);
    setTestStatus('idle');
    setTestMsg('');
    setModels([]);
    try {
      const res = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint.trim(), api_key: apiKey.trim() || undefined }),
      });
      const data = await res.json();
      if (data.models?.length) {
        setModels(data.models);
        setTestStatus('ok');
        setTestMsg(`${data.models.length} model${data.models.length !== 1 ? 's' : ''} found`);
        if (!model || !data.models.includes(model)) setModel(data.models[0]);
      } else {
        setTestStatus('fail');
        setTestMsg(data.error ?? 'No models returned.');
      }
    } catch {
      setTestStatus('fail');
      setTestMsg('Network error.');
    } finally {
      setTesting(false);
    }
  };

  /**
   * Enable the bundled Exa MCP server and (if the operator supplied one)
   * store `EXA_API_KEY` on that server's per-server env so the subprocess
   * picks it up. We do NOT write to `data/.env` any more — the MCP allow-
   * list in lib/mcp-client.ts does not forward host env by default, so
   * a per-server credential is the supported path.
   */
  const enableExaServer = async () => {
    if (!enableWebSearch) return;
    const res = await fetch('/api/mcp');
    const data = await res.json().catch(() => ({}));
    const exa = (data.servers ?? []).find(
      (s: { name?: string; github_url?: string }) =>
        s.name === 'exa' || s.github_url === 'builtin://exa',
    );
    if (!exa?.id) throw new Error('Exa MCP server was not found.');
    const trimmedKey = exaKey.trim();
    await fetch('/api/mcp', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: exa.id,
        enabled: true,
        // Only set env when the user actually typed a key. Use `envPatch`
        // (merge semantics) rather than `env` (replace semantics) so
        // onboarding cannot wipe any operator-added Exa MCP env vars.
        ...(trimmedKey ? { envPatch: { EXA_API_KEY: trimmedKey } } : {}),
      }),
    });
  };

  const saveAll = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: endpoint.trim(),
          api_key: apiKey.trim() || undefined,
          default_model: model.trim(),
        }),
      });
      await enableExaServer();
      await fetch('/api/builtin-tools', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'run_shell', enabled: enableShell }),
      });
      router.push('/chat');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-3">
      <div className="w-full max-w-lg space-y-3">
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-4 text-white shadow-xl">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-800 tracking-tight truncate">Welcome to AgentPrimer</h1>
              <p className="text-blue-200 text-sm">Three quick setup steps. Don&apos;t worry, you can change everything later inside the app.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 px-1">
          {steps.map((label, i) => (
            <div key={label} className="flex-1 flex items-center gap-2">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center text-sm font-800 ${i <= step ? 'bg-blue-500 text-white' : 'bg-gray-800 text-gray-500'}`}>{i + 1}</div>
              <span className={`text-sm font-700 hidden sm:inline ${i <= step ? 'text-gray-100' : 'text-gray-500'}`}>{label}</span>
              {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${i < step ? 'bg-blue-500' : 'bg-gray-800'}`} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-gray-800 border border-gray-700 shadow-xl overflow-visible">
          {step === 0 && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-200 font-800"><Globe size={16} className="text-blue-400" /> OpenAI-compatible API endpoint and key</div>
              <input type="url" value={endpoint} onChange={e => { setEndpoint(e.target.value); setTestStatus('idle'); }} placeholder="https://api.openai.com/v1" className="w-full h-10 bg-gray-900 text-gray-100 px-3 rounded-lg border border-gray-600 text-sm focus:outline-none focus:border-blue-500 font-mono" />
              <div className="relative">
                <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => { setApiKey(e.target.value); setTestStatus('idle'); }} placeholder="API key" className="w-full h-10 bg-gray-900 text-gray-100 pl-3 pr-10 rounded-lg border border-gray-600 text-sm focus:outline-none focus:border-blue-500 font-mono" />
                <button type="button" onClick={() => setShowKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
              </div>
              <button type="button" onClick={testConnection} disabled={testing || !endpoint} className="w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm font-700 text-gray-200">
                {testing ? <><RefreshCw size={14} className="animate-spin" /> Testing…</> : <><RefreshCw size={14} /> Test & fetch models</>}
              </button>
              {testStatus !== 'idle' && <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${testStatus === 'ok' ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300' : 'bg-red-950/60 border border-red-800 text-red-300'}`}>{testStatus === 'ok' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}{testMsg}</div>}
              <div>
                <div className="flex items-center gap-2 mb-2"><Cpu size={15} className="text-amber-400" /><span className="text-sm font-700 text-gray-200">Default model for agents</span></div>
                {models.length > 0 ? (
                  <CustomDropDown
                    models={models}
                    value={models.includes(model) ? model : ''}
                    onChange={setModel}
                    placeholder="Select default model…"
                    compact
                    align="left"
                    className="[&_button]:h-10 [&_button]:bg-gray-900 [&_button]:text-gray-100 [&_button]:border [&_button]:border-gray-600 [&_button]:font-mono [&_button]:focus:bg-gray-900 [&_button]:dark:focus:bg-gray-900"
                  />
                ) : (
                  <input type="text" value={model} onChange={e => setModel(e.target.value)} placeholder="e.g. deepseek-chat, gpt-4o" className="w-full h-10 bg-gray-900 text-gray-100 px-3 rounded-lg border border-gray-600 text-sm focus:outline-none focus:border-blue-500 font-mono" />
                )}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-200 font-800"><Search size={16} className="text-emerald-400" /> Web search</div>
              <label className="flex items-start gap-3 rounded-xl bg-gray-900 border border-gray-700 p-3 cursor-pointer">
                <input type="checkbox" checked={enableWebSearch} onChange={e => setEnableWebSearch(e.target.checked)} className="mt-1" />
                <span className="text-sm text-gray-300">Enable Exa web search MCP. Get a free key from <a href="https://exa.ai/" target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline">exa.ai</a>.</span>
              </label>
              {enableWebSearch && (
                <div className="space-y-1.5">
                  <label className="text-sm font-700 text-gray-200">Enter API Key</label>
                  <div className="relative">
                    <input type={showExaKey ? 'text' : 'password'} value={exaKey} onChange={e => setExaKey(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className="w-full h-10 bg-gray-900 text-gray-100 pl-3 pr-10 rounded-lg border border-gray-600 text-sm focus:outline-none focus:border-blue-500 font-mono" />
                    <button type="button" onClick={() => setShowExaKey(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">{showExaKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </div>
                </div>
              )}
              {enableWebSearch && (
                <p className="text-sm text-gray-500">The key is stored only on the Exa MCP server&apos;s environment. You can update it later in Skills &amp; MCP → Exa → Edit → Environment variables.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-gray-200 font-800"><Terminal size={16} className="text-red-400" /> Shell access</div>
              <label className="flex items-start gap-3 rounded-xl bg-red-950/30 border border-red-800/60 p-3 cursor-pointer">
                <input type="checkbox" checked={enableShell} onChange={e => setEnableShell(e.target.checked)} className="mt-1" />
                <span className="text-sm text-red-200">Enable Shell Access to authorize advanced system automation. This allows the agent to run native commands and handle complex workflows natively. Recommended for full agentic capability.</span>
              </label>
              {saveError && <div className="text-sm text-red-300 bg-red-950/60 border border-red-800 rounded-lg px-3 py-2">{saveError}</div>}
            </div>
          )}

          <div className="p-4 border-t border-gray-700 flex items-center gap-3">
            <button type="button" onClick={() => step === 0 ? router.push('/chat') : setStep(s => s - 1)} className="px-4 h-10 rounded-xl border border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500 text-sm font-700 flex items-center gap-2">
              {step === 0 ? 'Skip' : <><ArrowLeft size={14} /> Back</>}
            </button>
            <button type="button" onClick={() => step < 2 ? setStep(s => s + 1) : saveAll()} disabled={saving} className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-800 text-sm">
              {saving ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : step < 2 ? <><ArrowRight size={15} /> Next</> : <><ArrowRight size={15} /> Finish</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
