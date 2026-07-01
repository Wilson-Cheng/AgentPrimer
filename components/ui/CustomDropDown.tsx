'use client';

import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { ChevronDown, Search, Cpu } from 'lucide-react';

interface CustomDropDownProps {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  placeholder?: string;
  className?: string;
  compact?: boolean;
  allowFreeText?: boolean;
  icon?: ReactNode;
  searchPlaceholder?: string;
  noun?: { singular: string; plural: string };
  align?: 'left' | 'right';
}

export default function CustomDropDown({
  models,
  value,
  onChange,
  placeholder = 'Select a model…',
  className = '',
  compact = false,
  allowFreeText = true,
  icon,
  searchPlaceholder = 'Search models…',
  noun = { singular: 'model', plural: 'models' },
  align = 'right',
}: CustomDropDownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [mobilePopup, setMobilePopup] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return trimmed ? models.filter((m) => m.toLowerCase().includes(trimmed)) : models;
  }, [models, query]);

  const openPicker = () => {
    setMobilePopup(
      typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
    );
    setOpen(true);
  };

  const closePicker = () => {
    setOpen(false);
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !mobilePopup &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        closePicker();
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, mobilePopup]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
      const selectedIndex = filtered.findIndex((m) => m === value);
      setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [filtered, open, value]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector('[data-hl="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const select = (model: string) => {
    onChange(model);
    closePicker();
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      openPicker();
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePicker();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) {
        select(filtered[highlighted]);
      } else if (allowFreeText && query.trim()) {
        select(query.trim());
      }
    }
  };

  const panel = (
    <>
      <div className="p-2 border-b border-gray-100 dark:border-gray-700">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={handleSearchKeyDown}
            placeholder={searchPlaceholder}
            className="w-full h-9 pl-7 pr-3 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>
      <div ref={listRef} className="max-h-[55dvh] md:max-h-72 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          allowFreeText && query.trim() ? (
            <button
              onClick={() => select(query.trim())}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
            >
              Use &ldquo;{query.trim()}&rdquo;
            </button>
          ) : (
            <p className="px-3 py-2.5 text-sm text-gray-400 text-center">No {noun.plural} match</p>
          )
        ) : (
          filtered.map((m, i) => {
            const isSelected = m === value;
            const isHl = i === highlighted;
            return (
              <button
                key={m}
                data-hl={isHl ? 'true' : undefined}
                onClick={() => select(m)}
                onMouseEnter={() => setHighlighted(i)}
                className={`w-full text-left px-3 py-2 text-sm font-mono transition-colors truncate block ${
                  isSelected && !isHl
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : isHl
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                }`}
              >
                {isSelected && <span className="mr-1.5 text-blue-500">✓</span>}
                {m}
              </button>
            );
          })
        )}
      </div>
      {models.length > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-400 text-right">
          {filtered.length} / {models.length} {models.length === 1 ? noun.singular : noun.plural}
        </div>
      )}
    </>
  );

  return (
    <div
      ref={containerRef}
      className={`relative ${compact ? 'w-full' : 'min-w-[180px]'} ${className}`}
    >
      <button
        type="button"
        onClick={() => (open ? closePicker() : openPicker())}
        onKeyDown={handleTriggerKeyDown}
        className={`
          w-full h-9 pl-9 pr-8 text-left
          bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100
          text-sm font-medium rounded-lg border-2 border-transparent
          focus:outline-none focus:bg-white dark:focus:bg-gray-700 focus:border-blue-500
          transition-all duration-200 flex items-center
          ${open ? 'bg-white dark:bg-gray-700 border-blue-500' : ''}
        `}
      >
        {icon ? (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
            {icon}
          </span>
        ) : (
          <Cpu
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
        )}
        <span className="truncate">
          {value || <span className="text-gray-400">{placeholder}</span>}
        </span>
        <ChevronDown
          size={14}
          className={`absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && !mobilePopup && (
        <div
          className={`absolute z-50 mt-1 ${align === 'left' ? 'left-0' : 'right-0'} w-full min-w-[260px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-2xl overflow-hidden`}
        >
          {panel}
        </div>
      )}

      {open && mobilePopup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
          onClick={closePicker}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-sm font-800 text-gray-900 dark:text-gray-100">
                Select {noun.singular}
              </p>
              <button
                type="button"
                onClick={closePicker}
                className="h-8 w-8 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200"
              >
                ×
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}
    </div>
  );
}
