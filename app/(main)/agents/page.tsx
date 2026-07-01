'use client';

/**
 * app/agents/page.tsx
 * Dynamic tabs + dirty tracking + Ctrl-S + dark mode
 */

import { useState, useEffect, useRef } from 'react';

import Button from '@/components/ui/Button';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Brain,
  FileText,
  Save,
  Eye,
  Code2,
  Check,
  RefreshCw,
  Info,
  Plus,
  BookOpen,
} from 'lucide-react';
import CustomDropDown from '@/components/ui/CustomDropDown';
import WritingGuideModal, { type GuideFile } from '@/components/WritingGuideModal';

type ViewMode = 'edit' | 'preview';

function LeaveDialog({ onLeave, onCancel }: { onLeave: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <h3 className="font-700 text-gray-900 dark:text-gray-100 text-base mb-2">
          Unsaved changes
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          You have unsaved changes. If you leave now they will be lost.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onLeave}>
            Leave
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [files, setFiles] = useState<string[]>([]);
  const [activeFile, setActiveFile] = useState('system.md');
  const [contents, setContents] = useState<Record<string, string>>({});
  const [savedContents, setSavedContents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [leaveDialog, setLeaveDialog] = useState<{ onConfirm: () => void } | null>(null);
  const [isMac, setIsMac] = useState(false);
  // New-file dialog state
  const [newFileDialog, setNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileError, setNewFileError] = useState('');
  // Writing-guide popup — only available for the three special files.
  const [guideFile, setGuideFile] = useState<GuideFile | null>(null);
  const [selectedFileSet, setSelectedFileSet] = useState('system');

  useEffect(() => {
    setTimeout(() => setIsMac(/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)), 0); // Defer to avoid hydration mismatch
  }, []);

  const modKey = isMac ? '\u2318' : 'Ctrl';

  const isDirty = (file: string) =>
    contents[file] !== undefined && contents[file] !== savedContents[file];

  const doLoadAll = async () => {
    try {
      const listRes = await fetch('/api/data-files');
      const listData = await listRes.json();
      const fileList: string[] = listData.files ?? [
        'system.md',
        'agents/main/agent.md',
        'agents/main/memory.md',
      ];
      setFiles(fileList);
      const pairs = await Promise.all(
        fileList.map(async (f) => {
          const res = await fetch(`/api/data-files?file=${encodeURIComponent(f)}`);
          const data = await res.json();
          return [f, data.content ?? ''] as [string, string];
        }),
      );
      const map = Object.fromEntries(pairs);
      setContents(map);
      setSavedContents(map);
    } finally {
      setLoading(false);
    }
  };

  const loadAll = () => {
    setLoading(true);
    doLoadAll();
  };

  useEffect(() => {
    doLoadAll();
  }, []);

  const handleCreateFile = async () => {
    const raw = newFileName.trim();
    if (!raw) return;
    // Strip .md suffix if user typed it — we always append it
    const base = raw.replace(/\.md$/i, '');
    const fullName = `${base}.md`;
    if (!/^[a-zA-Z0-9_\- ]+\.md$/.test(fullName)) {
      setNewFileError('Name can only contain letters, numbers, spaces, hyphens and underscores.');
      return;
    }
    if (files.includes(fullName)) {
      setNewFileError('A file with that name already exists.');
      return;
    }
    setCreatingFile(true);
    setNewFileError('');
    const initial = `# ${base}\n\n`;
    const res = await fetch('/api/data-files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: fullName, content: initial }),
    });
    if (res.ok) {
      setFiles((prev) => [...prev, fullName]);
      setContents((prev) => ({ ...prev, [fullName]: initial }));
      setSavedContents((prev) => ({ ...prev, [fullName]: initial }));
      setActiveFile(fullName);
      setNewFileDialog(false);
      setNewFileName('');
    } else {
      const data = await res.json().catch(() => ({}));
      setNewFileError((data as { error?: string }).error ?? 'Failed to create file.');
    }
    setCreatingFile(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    const content = contents[activeFile] ?? '';
    await fetch('/api/data-files', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: activeFile, content }),
    });
    setSaving(false);
    setSaved(true);
    setSavedContents((prev) => ({ ...prev, [activeFile]: content }));
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleTabSwitch = (file: string) => {
    if (file === activeFile) return;
    if (isDirty(activeFile)) {
      setLeaveDialog({
        onConfirm: () => {
          setLeaveDialog(null);
          setActiveFile(file);
        },
      });
    } else {
      setActiveFile(file);
    }
  };

  const isAgentFile = (file: string) => file.startsWith('agents/') && file.endsWith('/agent.md');
  const isMemoryFile = (file: string) => file.startsWith('agents/') && file.endsWith('/memory.md');
  const getAgentNameFromFile = (file: string) => file.match(/^agents\/([^/]+)\//)?.[1] ?? '';
  const agentNames = Array.from(
    new Set(
      files
        .filter((file) => isAgentFile(file) || isMemoryFile(file))
        .map(getAgentNameFromFile)
        .filter(Boolean),
    ),
  ).sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : a.localeCompare(b)));
  const visibleFiles =
    selectedFileSet === 'system'
      ? files.filter((file) => file === 'system.md')
      : files.filter(
          (file) =>
            file === `agents/${selectedFileSet}/agent.md` ||
            file === `agents/${selectedFileSet}/memory.md`,
        );

  useEffect(() => {
    if (visibleFiles.length && !visibleFiles.includes(activeFile)) {
      setActiveFile(visibleFiles[0]);
    }
  }, [activeFile, visibleFiles]);

  const handleFileSetSwitch = (nextSet: string) => {
    if (nextSet === selectedFileSet) return;
    const nextFiles =
      nextSet === 'system'
        ? files.filter((file) => file === 'system.md')
        : files.filter(
            (file) =>
              file === `agents/${nextSet}/agent.md` || file === `agents/${nextSet}/memory.md`,
          );
    const switchSet = () => {
      setSelectedFileSet(nextSet);
      if (nextFiles.length) setActiveFile(nextFiles[0]);
    };
    if (isDirty(activeFile)) {
      setLeaveDialog({
        onConfirm: () => {
          setLeaveDialog(null);
          switchSet();
        },
      });
    } else {
      switchSet();
    }
  };

  const fileIcon = (file: string) =>
    isAgentFile(file) ? <Brain size={14} /> : <FileText size={14} />;

  const infoBanner = (file: string) => {
    if (isAgentFile(file))
      return 'Agent definition. Specify System Prompt, Tools (comma-separated or "all"), Model, and optional Output Schema.';
    if (isMemoryFile(file))
      return 'Private long-term memory for this agent. The agent updates this file with append_memory or replace_memory.';
    if (file === 'system.md')
      return 'This file is a core system prompt. Useful for global instructions or context that should not be modified by the agent.';
    return 'Custom context file. Add instructions in the agent.md file to tell the agent when and how to use this file.';
  };

  const infoBannerStyle = (file: string) => {
    if (isAgentFile(file))
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300';
    if (isMemoryFile(file))
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300';
    if (file === 'system.md')
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300';
    return 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400';
  };

  return (
    <>
      {leaveDialog && (
        <LeaveDialog onLeave={leaveDialog.onConfirm} onCancel={() => setLeaveDialog(null)} />
      )}

      {/* Writing-guide modal */}
      {guideFile && <WritingGuideModal file={guideFile} onClose={() => setGuideFile(null)} />}

      {/* New-file dialog */}
      {newFileDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full">
            <h3 className="font-700 text-gray-900 dark:text-gray-100 text-base mb-1">New file</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Enter a filename — it will be saved in the data directory.
            </p>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={newFileName}
                onChange={(e) => {
                  setNewFileName(e.target.value);
                  setNewFileError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateFile();
                  if (e.key === 'Escape') {
                    setNewFileDialog(false);
                    setNewFileName('');
                    setNewFileError('');
                  }
                }}
                placeholder="my-notes"
                className="flex-1 h-9 px-3 rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:border-blue-500 transition-colors"
              />
              <span className="text-sm text-gray-400 dark:text-gray-500 select-none">.md</span>
            </div>
            {newFileError && (
              <p className="text-red-500 dark:text-red-400 text-sm mt-2">{newFileError}</p>
            )}
            <div className="flex gap-3 justify-end mt-5">
              <button
                onClick={() => {
                  setNewFileDialog(false);
                  setNewFileName('');
                  setNewFileError('');
                }}
                className="px-4 py-2 rounded-lg text-sm font-600 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFile}
                disabled={creatingFile || !newFileName.trim()}
                className="px-4 py-2 rounded-lg text-sm font-600 text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {creatingFile ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="bg-violet-600 pl-14 pr-6 py-6 md:px-8 md:py-10 relative overflow-hidden flex-shrink-0">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/3 -translate-y-1/3" />
          <div className="absolute bottom-0 left-8 w-32 h-32 bg-white/10 rounded-full translate-y-1/2" />
          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between mx-auto w-full gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 min-w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <Brain size={24} className="text-white" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <h1 className="text-2xl md:text-3xl font-800 text-white tracking-tight truncate">
                  Prompts &amp; Memory
                </h1>
                <p className="text-violet-200 text-sm truncate">
                  Configure agent behaviour and persistent memory
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
                {(['edit', 'preview'] as ViewMode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setViewMode(m)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-600 transition-all duration-150 ${viewMode === m ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    {m === 'edit' ? <Code2 size={14} /> : <Eye size={14} />}
                    {m === 'edit' ? 'Edit' : 'Preview'}
                  </button>
                ))}
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={saving}
                title={`Save (${modKey}S)`}
              >
                {saved ? (
                  <>
                    <Check size={14} /> Saved!
                  </>
                ) : (
                  <>
                    <Save size={14} /> Save
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-200 dark:border-gray-800 flex items-center bg-white dark:bg-gray-900 flex-shrink-0 px-6">
          <div className="py-2 pr-3 flex-shrink-0">
            <CustomDropDown
              models={['system', ...agentNames]}
              value={selectedFileSet}
              onChange={handleFileSetSwitch}
              placeholder="Select prompt set…"
              searchPlaceholder="Search prompt sets…"
              noun={{ singular: 'prompt set', plural: 'prompt sets' }}
              icon={<Brain size={14} />}
              allowFreeText={false}
              align="left"
            />
          </div>
          <div className="flex gap-0.5 items-center min-w-0 flex-1 overflow-x-auto overflow-y-visible">
            {visibleFiles.map((f) => (
              <button
                key={f}
                onClick={() => handleTabSwitch(f)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-600 border-b-2 -mb-px transition-all duration-150 whitespace-nowrap ${activeFile === f ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                {fileIcon(f)}
                {isDirty(f) && <span className="text-red-500 font-800">*</span>}
                {f.split('/').pop() ?? f}
              </button>
            ))}
          </div>
          <button
            onClick={loadAll}
            className="ml-2 p-1.5 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors flex-shrink-0"
            title="Refresh file list"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 gap-3">
            <RefreshCw size={18} className="animate-spin" />
            <span>Loading{'\u2026'}</span>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div
              className={`mx-8 mt-4 mb-3 flex flex-col lg:flex-row items-center gap-2.5 text-sm rounded-lg px-4 py-2 ${infoBannerStyle(activeFile)}`}
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5 ">
                <Info size={14} className="flex-shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0">{infoBanner(activeFile)}</span>
              </div>
              {(activeFile === 'system.md' ||
                isAgentFile(activeFile) ||
                isMemoryFile(activeFile)) && (
                <button
                  onClick={() =>
                    setGuideFile(
                      activeFile === 'system.md'
                        ? 'system.md'
                        : isAgentFile(activeFile)
                          ? 'agent.md'
                          : 'memory.md',
                    )
                  }
                  className="flex items-center gap-1 px-2 py-0.5 -my-0.5 rounded font-600 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-300/70 dark:border-amber-700/60 transition-colors flex-shrink-0 whitespace-nowrap"
                  title={`How to write ${activeFile}`}
                >
                  <BookOpen size={12} />
                  How to write this file
                </button>
              )}
            </div>
            <div className="flex-1 mx-8 mb-6 overflow-hidden rounded-xl border-2 border-gray-200 dark:border-gray-700 focus-within:border-blue-500 transition-colors duration-200">
              {viewMode === 'edit' ? (
                <textarea
                  value={contents[activeFile] ?? ''}
                  onChange={(e) =>
                    setContents((prev) => ({ ...prev, [activeFile]: e.target.value }))
                  }
                  className="w-full h-full p-5 text-sm font-mono text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 resize-none focus:outline-none leading-relaxed"
                  placeholder={
                    isAgentFile(activeFile)
                      ? '# main\n**System Prompt:** You are a helpful assistant.\n**Tools:** all\n**Model:** default'
                      : isMemoryFile(activeFile)
                        ? '# Agent Memory\n\n## Preferences\n- ...'
                        : `# ${activeFile.replace('.md', '')}\n\nAdd your notes here{'\u2026'}`
                  }
                  spellCheck={false}
                />
              ) : (
                <div className="w-full h-full p-5 overflow-y-auto bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                  <div className="markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {contents[activeFile] ?? ''}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </>
  );
}
