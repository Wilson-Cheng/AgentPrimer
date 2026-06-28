'use client';

/**
 * components/editor/EditorTabBar.tsx
 * ---------------------------------------------------------------------------
 * Top bar of the editor area, containing:
 *   • Sidebar collapse / expand toggle
 *   • Horizontally-scrolling tab strip with dirty indicator and close button
 *   • Save / Save All buttons (with spinner + error message)
 *   • Preview pane toggle
 *
 * This component is purely presentational: every action is dispatched up
 * to the parent <CodeEditorPanel>, which owns the underlying state.
 * Right-click context menu items are also built by the parent so they
 * can call the panel-level `closeTab` / `closeOthers` / etc. callbacks.
 */

import React from 'react';
import {
  Save, SaveAll, X, Loader2, AlertCircle,
  PanelLeftClose, PanelLeftOpen, Eye, EyeOff,
} from 'lucide-react';
import type { OpenTab } from './types';

interface Props {
  tabs: OpenTab[];
  activeTabPath: string | null;
  sidebarCollapsed: boolean;
  saving: Set<string>;
  saveError: string | null;
  dirtyCount: number;
  activeIsDirty: boolean;
  previewEnabled: boolean;
  tabScrollRef: React.RefObject<HTMLDivElement | null>;
  activeTabRef: React.RefObject<HTMLDivElement | null>;
  onToggleSidebar: () => void;
  onTogglePreview: () => void;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onSaveActive: () => void;
  onSaveAll: () => void;
  onTabContextMenu: (e: React.MouseEvent, path: string) => void;
}

export default function EditorTabBar({
  tabs, activeTabPath, sidebarCollapsed, saving, saveError, dirtyCount, activeIsDirty,
  previewEnabled, tabScrollRef, activeTabRef,
  onToggleSidebar, onTogglePreview, onSelectTab, onCloseTab,
  onSaveActive, onSaveAll, onTabContextMenu,
}: Props) {
  return (
    <div className="flex items-stretch flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      {/* Sidebar toggle */}
      <div className="flex items-center flex-shrink-0 border-r border-gray-200 dark:border-gray-700">
        <button
          onClick={onToggleSidebar}
          className="p-2 rounded-none hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
          title={sidebarCollapsed ? 'Show file browser' : 'Hide file browser'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      {/* Scrollable tab strip */}
      <div ref={tabScrollRef} className="flex items-end min-w-0 flex-1 overflow-x-auto">
        {tabs.map(tab => {
          const isDirty  = tab.content !== tab.savedContent;
          const isActive = tab.path === activeTabPath;
          return (
            <div
              ref={isActive ? activeTabRef : undefined}
              key={tab.path}
              onClick={() => onSelectTab(tab.path)}
              onContextMenu={e => onTabContextMenu(e, tab.path)}
              className={`group flex items-center gap-1.5 px-3 py-2 text-md cursor-pointer flex-shrink-0 border-r border-gray-200 dark:border-gray-700 transition-colors
                ${isActive
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-b-2 border-b-blue-500'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-750'}
              `}
            >
              {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />}
              <span className="max-w-40 truncate">{tab.label}</span>
              <button
                onClick={e => { e.stopPropagation(); onCloseTab(tab.path); }}
                className="opacity-0 group-hover:opacity-100 ml-0.5 rounded hover:bg-gray-300 dark:hover:bg-gray-600 p-0.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-all flex-shrink-0"
              ><X size={14} /></button>
            </div>
          );
        })}
      </div>

      {/* Save / preview controls */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0 border-l border-gray-200 dark:border-gray-700">
        {saveError && (
          <span className="flex items-center gap-1 text-red-500 text-sm mr-1">
            <AlertCircle size={14} />{saveError}
          </span>
        )}
        <button
          onClick={onSaveActive}
          disabled={!activeIsDirty || saving.has(activeTabPath ?? '')}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 dark:disabled:text-gray-500"
        >
          {saving.has(activeTabPath ?? '') ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Save
        </button>
        <button
          onClick={onSaveAll}
          disabled={dirtyCount === 0}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white disabled:text-gray-400 dark:disabled:text-gray-500"
        >
          <SaveAll size={14} />
          {dirtyCount > 0 ? `Save All (${dirtyCount})` : 'Save All'}
        </button>

        {/* Preview toggle — persisted to .ui-settings.json as editorPreviewEnabled. */}
        <button
          onClick={onTogglePreview}
          title={previewEnabled ? 'Hide preview pane' : 'Show preview pane'}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            previewEnabled
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          {previewEnabled ? <Eye size={14} /> : <EyeOff size={14} />}
          Preview
        </button>
      </div>
    </div>
  );
}
