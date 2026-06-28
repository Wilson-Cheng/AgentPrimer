'use client';

import { useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import CustomDropDown from '@/components/ui/CustomDropDown';

interface ModelSelectorProps {
  value: string;
  onChange: (model: string) => void;
  className?: string;
  /** When true, the selector fills its container (no min-width). Use in flex rows. */
  compact?: boolean;
}

/**
 * ModelSelector – fetches model list from /api/models and renders a searchable dropdown.
 */
export default function ModelSelector({ value, onChange, className = '', compact = false }: ModelSelectorProps) {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const doFetch = async (cancelled: { current: boolean }) => {
    try {
      const [modelsRes, settingsRes] = await Promise.all([
        fetch('/api/models'),
        fetch('/api/settings'),
      ]);
      const modelsData = await modelsRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      if (cancelled.current) return;

      if (modelsData.models?.length) {
        const list: string[] = modelsData.models;
        setModels(list);

        // Only auto-select when the current value is empty or not in the list
        if (!value || !list.includes(value)) {
          const defaultModel: string = settingsData.settings?.default_model ?? '';
          const best = (defaultModel && list.includes(defaultModel))
            ? defaultModel
            : list[0];
          onChange(best);
        }
      } else {
        setError(modelsData.error || 'No models returned');
      }
    } catch {
      if (!cancelled.current) setError('Network error');
    } finally {
      if (!cancelled.current) setLoading(false);
    }
  };

  const loadModels = () => {
    setLoading(true);
    setError('');
    doFetch({ current: false });
  };

  useEffect(() => {
    const cancelled = { current: false };
    doFetch(cancelled);
    return () => { cancelled.current = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className={`flex items-center gap-2 h-9 px-3 bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-400 text-sm ${compact ? 'w-full' : 'min-w-[180px]'} ${className}`}>
        <Cpu size={14} className="flex-shrink-0" />
        <span className="truncate">Loading models…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <div className={`h-9 px-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-sm flex items-center ${compact ? 'flex-1 min-w-0' : 'max-w-[220px]'}`} title={error}>
          <Cpu size={14} className="flex-shrink-0 mr-1.5" />
          <span className="truncate">{error}</span>
        </div>
        <button
          onClick={loadModels}
          className="h-9 w-9 flex items-center justify-center bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-500 transition-colors flex-shrink-0"
          title="Retry loading models"
        >
          <RefreshCw size={14} />
        </button>
      </div>
    );
  }

  return (
    <CustomDropDown
      models={models}
      value={value}
      onChange={onChange}
      compact={compact}
      className={className}
    />
  );
}
