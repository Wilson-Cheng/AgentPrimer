'use client';

import { useState, useCallback } from 'react';
import Button from '@/components/ui/Button';

interface CustomConfirmDialogProps {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function CustomConfirmDialog({
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
}: CustomConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-md w-full">
        <h3 className="font-700 text-gray-900 dark:text-gray-100 text-base mb-2">{title}</h3>
        <div className="text-sm text-gray-600 dark:text-gray-300 mb-5 space-y-2">
          {message}
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={confirmVariant} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface PendingConfirm {
  title?: string;
  message: React.ReactNode;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  resolve: (value: boolean) => void;
}

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const showConfirm = useCallback(
    (
      message: React.ReactNode,
      options?: { title?: string; confirmLabel?: string; confirmVariant?: 'primary' | 'danger' },
    ): Promise<boolean> =>
      new Promise(resolve => {
        setPending({ message, ...options, resolve });
      }),
    [],
  );

  const ConfirmModal = pending ? (
    <CustomConfirmDialog
      title={pending.title}
      message={pending.message}
      confirmLabel={pending.confirmLabel}
      confirmVariant={pending.confirmVariant}
      onConfirm={() => { pending.resolve(true); setPending(null); }}
      onCancel={() => { pending.resolve(false); setPending(null); }}
    />
  ) : null;

  return { showConfirm, ConfirmModal };
}
