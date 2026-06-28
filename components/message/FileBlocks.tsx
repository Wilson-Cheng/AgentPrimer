'use client';

/**
 * components/message/FileBlocks.tsx
 * ---------------------------------------------------------------------------
 * File-rendering components. Both share the same MIME-aware preview logic
 * (image / video / audio / text) and the formatBytes helper.
 *
 *   • AgentFileCard – rich preview for files delivered by the agent's
 *                     send_file tool (see lib/agent-files.ts).
 *   • AttachmentRow – user attachments displayed in the chat input bubble.
 */

import { useState } from 'react';
import { Download, FileVideo, FileAudio, FileText, File } from 'lucide-react';
import type { AgentFileResult, Attachment } from './types';

/** Human-readable byte count: 512B, 3.4KB, 12.0MB. Shared by both cards. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ---------------------------------------------------------------------------
// AgentFileCard – rich file preview for files delivered by the send_file tool
// ---------------------------------------------------------------------------
export function AgentFileCard({ file }: { file: AgentFileResult }) {
  const isImage = file.mime_type.startsWith('image/');
  const isVideo = file.mime_type.startsWith('video/');
  const isAudio = file.mime_type.startsWith('audio/');
  const isText  = file.mime_type.startsWith('text/') || file.mime_type === 'application/json';

  // Lazy-load text content for inline preview
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);

  const loadText = async () => {
    if (textContent !== null || textLoading) return;
    setTextLoading(true);
    try {
      const r = await fetch(file.url);
      const t = await r.text();
      setTextContent(t);
    } catch {
      setTextContent('(could not load file content)');
    } finally {
      setTextLoading(false);
    }
  };

  const FileIcon = isVideo ? FileVideo : isAudio ? FileAudio : isText ? FileText : File;

  return (
    <div className="w-full min-w-0 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      {/* Image preview */}
      {isImage && (
        <a href={file.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={file.url}
            alt={file.description ?? file.filename}
            className="w-full max-h-72 object-contain bg-gray-100 dark:bg-gray-900"
          />
        </a>
      )}

      {/* Video preview */}
      {isVideo && (
        <video
          src={file.url}
          controls
          className="w-full max-h-72 bg-black"
        />
      )}

      {/* Audio preview */}
      {isAudio && (
        <div className="p-3 pb-0 min-w-0 overflow-hidden">
          <audio src={file.url} controls className="w-full max-w-full h-10" />
        </div>
      )}

      {/* Text inline preview (click to expand) */}
      {isText && (
        <div className="p-3 pb-0">
          <button
            onClick={() => { setTextExpanded(v => !v); if (!textExpanded) loadText(); }}
            className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            <FileIcon size={14} />
            {textExpanded ? 'Collapse preview' : 'Preview content'}
          </button>
          {textExpanded && (
            <div className="mt-2">
              {textLoading
                ? <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
                : (
                  <pre className="text-sm bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-x-auto max-h-64 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {textContent}
                  </pre>
                )}
            </div>
          )}
        </div>
      )}

      {/* Footer: icon + name + size + description + download */}
      <div className="flex items-center gap-3 p-3">
        <div className="h-9 w-9 rounded-lg min-w-9 bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <FileIcon size={18} className="text-gray-500 dark:text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-600 text-gray-900 dark:text-gray-100 truncate">{file.filename}</p>
          {file.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{file.description}</p>
          )}
          <p className="text-sm text-gray-400 dark:text-gray-500">{formatBytes(file.size)} · {file.mime_type}</p>
        </div>
        <a
          href={file.url}
          download={file.filename}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 text-sm font-600 transition-colors flex-shrink-0"
        >
          <Download size={14} />
          Download
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AttachmentRow – images inline, other files as chips
// ---------------------------------------------------------------------------
export function AttachmentRow({ attachments, isUser }: { attachments: Attachment[]; isUser: boolean }) {
  return (
    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      {attachments.map((att, i) => {
        const isImage = att.mime.startsWith('image/');
        const isVideo = att.mime.startsWith('video/');
        const isAudio = att.mime.startsWith('audio/');

        if (isImage) {
          return (
            <a key={i} href={att.url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={att.url}
                alt={att.name}
                className="max-h-48 max-w-xs rounded-lg object-cover"
              />
            </a>
          );
        }
        if (isVideo) {
          return (
            <video key={i} src={att.url} controls className="max-h-48 max-w-xs rounded-lg" />
          );
        }
        if (isAudio) {
          return (
            <div key={i} className="flex flex-col gap-1">
              <span className="text-sm text-gray-500 dark:text-gray-400">{att.name}</span>
              <audio src={att.url} controls className="h-9 max-w-xs" />
            </div>
          );
        }
        return (
          <a
            key={i}
            href={att.url}
            download={att.name}
            className="flex items-center gap-2 px-3 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            <span>📎</span>
            <span className="max-w-[150px] truncate">{att.name}</span>
            <span className="text-gray-400">({formatBytes(att.size)})</span>
          </a>
        );
      })}
    </div>
  );
}
