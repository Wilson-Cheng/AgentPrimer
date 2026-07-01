'use client';

/**
 * app/approvals/page.tsx
 * ---------------------------------------------------------------------------
 * Approved Settings page.
 *
 * Shows every "Always approve" decision the user has granted to the agent.
 * Revoking an entry takes effect immediately: the approval is removed from
 * SQLite and the next agent operation that would have relied on it will ask
 * again.  Because permanent approvals are checked from the DB on every call,
 * the change is reflected in all open sessions without a restart.
 */

import { useState, useEffect } from 'react';

import { useConfirm } from '@/components/ui/CustomConfirmDialog';
import { ShieldCheck, ShieldOff, Trash2, RefreshCw, ShieldAlert, Terminal } from 'lucide-react';

type ApprovalOperation = 'delete' | 'read_dotfile' | 'run_shell';

interface ApprovalMeta {
  operation: ApprovalOperation;
  label: string;
  description: string;
  icon: React.ReactNode;
  dangerColor: string;
}

const APPROVAL_META: Record<ApprovalOperation, Omit<ApprovalMeta, 'operation'>> = {
  delete: {
    label: 'Delete Files',
    description:
      'Agent can permanently delete files and directories without asking for confirmation each time.',
    icon: <Trash2 size={20} />,
    dangerColor: 'text-red-500',
  },
  read_dotfile: {
    label: 'Read Hidden Files',
    description:
      'Agent can read dotfiles (e.g. .env, .gitconfig) without asking for confirmation each time.',
    icon: <ShieldOff size={20} />,
    dangerColor: 'text-amber-500',
  },
  run_shell: {
    label: 'Run Shell Commands',
    description:
      'Agent can execute arbitrary shell commands on the host system without asking for confirmation each time. Grants full system access.',
    icon: <Terminal size={20} />,
    dangerColor: 'text-red-600',
  },
};

function ApprovalCard({
  operation,
  onRevoke,
}: {
  operation: ApprovalOperation;
  onRevoke: (op: ApprovalOperation) => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const { showConfirm, ConfirmModal } = useConfirm();
  const meta = APPROVAL_META[operation] ?? {
    label: operation,
    description: 'Custom permanently-approved operation.',
    icon: <ShieldCheck size={20} />,
    dangerColor: 'text-gray-500',
  };

  const handleRevoke = async () => {
    const ok = await showConfirm(
      `The agent will start asking for confirmation again the next time it tries to perform "${meta.label}".`,
      { title: `Revoke "${meta.label}" approval?`, confirmLabel: 'Revoke' },
    );
    if (!ok) return;
    setRevoking(true);
    await fetch(`/api/approval?operation=${encodeURIComponent(operation)}`, {
      method: 'DELETE',
    });
    setRevoking(false);
    onRevoke(operation);
  };

  return (
    <>
      {ConfirmModal}
      <div className="flex items-start gap-4 p-5 rounded-xl border-2 border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/20 transition-all duration-150">
        <div className={`flex-shrink-0 mt-0.5 ${meta.dangerColor}`}>{meta.icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-700 text-gray-900 dark:text-gray-100 text-sm">{meta.label}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 leading-relaxed">
            {meta.description}
          </p>
          <span className="inline-flex items-center gap-1 mt-2 text-sm font-600 text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 rounded-full">
            <ShieldCheck size={14} />
            Always approved
          </span>
        </div>
        <button
          onClick={handleRevoke}
          disabled={revoking}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-600 bg-white dark:bg-gray-800 border-2 border-red-200 dark:border-red-800/60 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all duration-150"
          title="Remove this approval"
        >
          {revoking ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Revoke
        </button>
      </div>
    </>
  );
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalOperation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await fetch('/api/approval');
    if (res.ok) {
      const data = await res.json();
      setApprovals(data.permanent ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleRevoke = (op: ApprovalOperation) => {
    setApprovals((prev) => prev.filter((a) => a !== op));
  };

  return (
    <main className="flex-1 overflow-y-auto bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="bg-rose-700 pl-14 pr-6 py-6 md:px-8 md:py-10 relative overflow-hidden flex-shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-1/3 w-44 h-44 bg-black/10 rotate-45 translate-y-1/2" />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 min-w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={24} className="text-white" />
            </div>
            <div className="min-w-0 overflow-hidden">
              <h1 className="text-3xl font-800 text-white tracking-tight truncate">Approvals</h1>
              <p className="text-amber-100 text-sm truncate">
                Manage operations the agent is always allowed to perform without asking
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-8 py-8 space-y-6">
        {/* Info box */}
        <div className="flex gap-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
          <p>
            Revoking an approval takes effect <strong>immediately</strong> across all open sessions
            — the agent will start asking for confirmation again the next time it tries to perform
            that operation.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-gray-400 py-12 justify-center">
            <RefreshCw size={18} className="animate-spin" />
            <span>Loading approvals…</span>
          </div>
        ) : approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <ShieldCheck size={32} className="text-gray-400" />
            </div>
            <h3 className="font-700 text-gray-900 dark:text-gray-100 text-lg mb-1">
              No permanent approvals
            </h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm">
              When the agent asks for permission and you click <em>&quot;Always approve&quot;</em>,
              it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {approvals.length} permanent approval{approvals.length !== 1 ? 's' : ''} active
            </p>
            {approvals.map((op) => (
              <ApprovalCard key={op} operation={op} onRevoke={handleRevoke} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
