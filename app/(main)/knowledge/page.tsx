'use client';

/**
 * app/knowledge/page.tsx
 * ---------------------------------------------------------------------------
 * RAG management page — ingest documents, inspect sources, and test semantic
 * / keyword search against the retrieval pipeline.
 */

import { useState, useEffect, useRef } from 'react';

import Button from '@/components/ui/Button';
import RagViewerPanel from '@/components/RagViewerPanel';
import { useConfirm } from '@/components/ui/CustomConfirmDialog';
import {
  BookOpen,
  Upload,
  Trash2,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileText,
  Plus,
  ChevronDown,
  ChevronRight,
  Eye,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RagSource {
  id: number;
  name: string;
  source_type: string;
  embedding_model: string | null;
  chunk_count: number;
  ingested_at: number;
}

interface EmbedHealth {
  ok: boolean;
  status: string;
  model?: string;
  backend?: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(unix: number): string {
  return new Date(unix * 1000).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function modelBadge(model: string | null): string {
  if (!model) return 'FTS only';
  if (model.startsWith('local:')) return model.replace('local:', '');
  if (model.startsWith('openai:')) return model.replace('openai:', '');
  return model;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RagPage() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [sources, setSources] = useState<RagSource[]>([]);
  const [health, setHealth] = useState<EmbedHealth | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [checkingHealth, setCheckingHealth] = useState(false);

  // Ingest form
  const [ingestTab, setIngestTab] = useState<'paste' | 'upload'>('paste');
  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search panel
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [searchDone, setSearchDone] = useState(false);
  const [expandedChunk, setExpandedChunk] = useState<number | null>(null);

  const { showConfirm, ConfirmModal } = useConfirm();

  // View panel — opens on the right when the user clicks the eye icon on a row
  const [viewing, setViewing] = useState<{ id: number; title: string } | null>(null);

  // ── Data loading ───────────────────────────────────────────────────────────
  const loadSources = async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/rag/sources');
      const data = (await res.json()) as { sources?: RagSource[]; error?: string };
      if (data.sources) setSources(data.sources);
    } finally {
      setLoadingList(false);
    }
  };

  const refreshHealth = async () => {
    setCheckingHealth(true);
    try {
      const res = await fetch('/api/rag/health');
      const data = (await res.json()) as EmbedHealth;
      setHealth(data);
    } finally {
      setCheckingHealth(false);
    }
  };

  useEffect(() => {
    loadSources();
    refreshHealth();
  }, []);

  // ── Ingest ─────────────────────────────────────────────────────────────────
  const handleIngest = async () => {
    setIngestMsg(null);

    if (ingestTab === 'paste') {
      if (!docContent.trim()) {
        setIngestMsg({ ok: false, text: 'Document content cannot be empty.' });
        return;
      }
      const name = docName.trim() || `Paste ${new Date().toLocaleString()}`;
      setIngesting(true);
      try {
        const res = await fetch('/api/rag/sources', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, content: docContent, source_type: 'paste' }),
        });
        const data = (await res.json()) as {
          chunks?: number;
          embedded?: boolean;
          skipped?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? 'Ingest failed');
        const note = data.skipped
          ? `Skipped (identical content already indexed).`
          : `Indexed ${data.chunks} chunk${data.chunks !== 1 ? 's' : ''}${data.embedded ? ' with embeddings' : ' (FTS only — embedding unavailable)'}.`;
        setIngestMsg({ ok: true, text: note });
        setDocName('');
        setDocContent('');
        loadSources();
      } catch (e) {
        setIngestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      } finally {
        setIngesting(false);
      }
    } else {
      // File upload
      if (!uploadFile) {
        setIngestMsg({ ok: false, text: 'Please select a file.' });
        return;
      }
      const name = docName.trim() || uploadFile.name;
      const form = new FormData();
      form.append('name', name);
      form.append('file', uploadFile);
      setIngesting(true);
      try {
        const res = await fetch('/api/rag/sources', { method: 'POST', body: form });
        const data = (await res.json()) as {
          chunks?: number;
          embedded?: boolean;
          skipped?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? 'Ingest failed');
        const note = data.skipped
          ? `Skipped (identical content already indexed).`
          : `Indexed ${data.chunks} chunk${data.chunks !== 1 ? 's' : ''}${data.embedded ? ' with embeddings' : ' (FTS only — embedding unavailable)'}.`;
        setIngestMsg({ ok: true, text: note });
        setDocName('');
        setUploadFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        loadSources();
      } catch (e) {
        setIngestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
      } finally {
        setIngesting(false);
      }
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (source: RagSource) => {
    const confirmed = await showConfirm(
      <span>
        Delete <span className="font-semibold">{source.name}</span>? This cannot be undone.
      </span>,
      { title: 'Delete document', confirmLabel: 'Delete', confirmVariant: 'danger' },
    );
    if (!confirmed) return;
    await fetch(`/api/rag/sources/${source.id}`, { method: 'DELETE' });
    if (viewing?.id === source.id) setViewing(null);
    loadSources();
  };

  // ── Search ─────────────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    setSearchDone(false);
    setExpandedChunk(null);
    try {
      const res = await fetch('/api/rag/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, top_k: 5 }),
      });
      const data = (await res.json()) as { chunks?: string[]; error?: string };
      setSearchResults(data.chunks ?? []);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  };

  // ── Health badge ───────────────────────────────────────────────────────────
  const HealthBadge = () => {
    if (!health) return null;
    if (health.ok)
      return (
        <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg bg-white/20 text-white font-medium whitespace-nowrap">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> Embeddings ready
        </span>
      );
    if (health.status === 'degraded')
      return (
        <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg bg-yellow-500/30 text-yellow-100 font-medium whitespace-nowrap">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> FTS only
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-lg bg-red-500/30 text-red-100 font-medium whitespace-nowrap">
        <XCircle className="w-4 h-4 flex-shrink-0" /> Unavailable
      </span>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex overflow-hidden bg-white dark:bg-gray-950">
      <main
        className={`flex flex-col overflow-hidden bg-white dark:bg-gray-950 ${
          viewing ? 'hidden md:flex md:flex-1' : 'flex flex-1'
        }`}
      >
        {/* Header — sticks at top */}
        <div className="flex-shrink-0 bg-teal-600 pl-14 pr-6 py-6 md:px-8 md:py-10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-1/2 w-40 h-40 bg-black/10 rotate-45 translate-y-1/3" />
          <div className="relative z-10 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 min-w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <BookOpen size={24} className="text-white" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h1 className="text-3xl font-800 text-white tracking-tight truncate">RAG</h1>
                <p className="text-teal-100 text-sm truncate">
                  Upload and manage documents for retrieval-augmented generation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="items-end gap-1 hidden md:flex flex-col ">
                <HealthBadge />
                {health?.ok && health.model && (
                  <span className="text-teal-200 text-sm truncate max-w-[180px]">
                    {health.model}
                  </span>
                )}
              </div>
              <button
                onClick={refreshHealth}
                disabled={checkingHealth}
                className="h-10 w-10 flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                title="Refresh embedding provider status"
              >
                <RefreshCw className={`w-5 h-5 ${checkingHealth ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Scrollable content — scrollbar at browser edge */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto w-full px-6 py-8">
            {/* ── Ingest section ── */}
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4 text-teal-500" /> Add Document
              </h2>

              {/* Tab switcher */}
              <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 mb-4 w-fit">
                {(['paste', 'upload'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setIngestTab(tab);
                      setIngestMsg(null);
                    }}
                    className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                      ingestTab === tab
                        ? 'bg-teal-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    {tab === 'paste' ? 'Paste Text' : 'Upload File'}
                  </button>
                ))}
              </div>

              {/* Document name */}
              <input
                type="text"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder={
                  ingestTab === 'paste'
                    ? 'Document name (optional)'
                    : 'Document name (defaults to filename)'
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 mb-3"
              />

              {ingestTab === 'paste' ? (
                <textarea
                  value={docContent}
                  onChange={(e) => setDocContent(e.target.value)}
                  placeholder="Paste document text here…"
                  rows={7}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono resize-y"
                />
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-8 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 dark:hover:bg-teal-900/10 transition-colors"
                >
                  <Upload className="w-8 h-8 text-gray-400" />
                  {uploadFile ? (
                    <span className="text-sm text-teal-600 dark:text-teal-400 font-medium">
                      {uploadFile.name}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">
                      Click to select a file (.txt, .md, .pdf)
                    </span>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setUploadFile(f);
                      if (f && !docName) setDocName(f.name.replace(/\.[^.]+$/, ''));
                    }}
                  />
                </div>
              )}

              {ingestMsg && (
                <div
                  className={`mt-3 text-sm px-3 py-2 rounded-lg ${
                    ingestMsg.ok
                      ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                      : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                  }`}
                >
                  {ingestMsg.text}
                </div>
              )}

              <div className="mt-4 flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleIngest}
                  disabled={ingesting}
                  className="bg-teal-500 hover:bg-teal-600 text-white border-transparent"
                >
                  {ingesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Indexing…
                    </>
                  ) : (
                    'Index Document'
                  )}
                </Button>
              </div>
            </section>

            {/* ── Sources list ── */}
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-teal-500" />
                  Indexed Documents
                  <span className="ml-1 text-sm font-normal text-gray-400">({sources.length})</span>
                </h2>
                <button
                  onClick={loadSources}
                  disabled={loadingList}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {loadingList ? (
                <p className="text-sm text-gray-400 text-center py-6">Loading…</p>
              ) : sources.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No documents indexed yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {sources.map((src) => (
                    <li key={src.id} className="flex items-start gap-3 py-3">
                      <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                            {src.name}
                          </span>
                          <span className="text-sm px-1.5 py-0.5 rounded bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300 flex-shrink-0">
                            {modelBadge(src.embedding_model)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-400 mt-0.5">
                          {src.chunk_count} chunk{src.chunk_count !== 1 ? 's' : ''} ·{' '}
                          {src.source_type} · {formatDate(src.ingested_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => setViewing({ id: src.id, title: src.name })}
                        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          viewing?.id === src.id
                            ? 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300'
                            : 'text-gray-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-900/20'
                        }`}
                        title="View document"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(src)}
                        className="p-1.5 rounded-lg transition-colors flex-shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Search test panel ── */}
            <section className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                <Search className="w-4 h-4 text-teal-500" /> Test Search
              </h2>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter a search query…"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                  className="bg-teal-500 hover:bg-teal-600 text-white border-transparent flex-shrink-0"
                >
                  {searching ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Search className="w-3.5 h-3.5" />
                  )}
                  Search
                </Button>
              </div>

              {searchDone && (
                <div className="mt-4">
                  {searchResults.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No results found.</p>
                  ) : (
                    <ul className="space-y-2">
                      {searchResults.map((chunk, i) => {
                        const isOpen = expandedChunk === i;
                        const preview = chunk.slice(0, 180).replace(/\n/g, ' ');
                        return (
                          <li
                            key={i}
                            className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden"
                          >
                            <button
                              onClick={() => setExpandedChunk(isOpen ? null : i)}
                              className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                            >
                              <span className="text-sm font-bold text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5">
                                #{i + 1}
                              </span>
                              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 break-words">
                                {isOpen ? chunk : chunk.length > 180 ? preview + '…' : preview}
                              </span>
                              {chunk.length > 180 &&
                                (isOpen ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                ))}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </div>
          {/* end inner centered content */}
        </div>
        {/* end outer scroll container */}
      </main>
      {viewing && (
        <RagViewerPanel
          sourceId={viewing.id}
          title={viewing.title}
          onClose={() => setViewing(null)}
        />
      )}
      {ConfirmModal}
    </div>
  );
}
