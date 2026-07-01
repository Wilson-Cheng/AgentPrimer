'use client';

import { useRef, useState, useEffect, KeyboardEvent } from 'react';
import { Send, Paperclip, X, Image as ImageIcon, FileText, Square } from 'lucide-react';

interface Attachment {
  name: string;
  url: string;
  mime: string;
  size: number;
}

interface ChatInputProps {
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * ChatInput – multi-line text area with file attachment support.
 * Send on Enter (Shift+Enter for newline).
 * Files are uploaded to /api/upload immediately when attached.
 */
export default function ChatInput({
  onSend,
  onStop,
  disabled,
  placeholder = 'Message AgentPrimer…',
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Re-focus textarea whenever disabled transitions from true → false
  // (the browser removes focus from disabled elements automatically)
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const canSend = (text.trim().length > 0 || attachments.length > 0) && !disabled && !uploading;

  const handleSend = () => {
    if (!canSend) return;
    onSend(text.trim(), attachments);
    setText('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize textarea
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setUploading(true);
    const uploaded: Attachment[] = [];

    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({ name: data.name, url: data.url, mime: data.mime, size: data.size });
        }
      } catch {
        /* skip failed uploads */
      }
    }

    setAttachments((prev) => [...prev, ...uploaded]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(
      (item) => item.kind === 'file' && item.type.startsWith('image/'),
    );
    if (imageItems.length === 0) return; // Let default paste handle text/other content

    e.preventDefault();

    // Paste any plain text that may also be on the clipboard
    const pastedText = e.clipboardData.getData('text');
    if (pastedText) {
      setText((prev) => prev + pastedText);
      // Resize textarea after text insertion
      setTimeout(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.style.height = 'auto';
          ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
        }
      }, 0);
    }

    setUploading(true);
    const uploaded: Attachment[] = [];

    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      const ext = item.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const namedFile = new File([file], `screenshot-${Date.now()}.${ext}`, { type: item.type });
      const formData = new FormData();
      formData.append('file', namedFile);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({ name: data.name, url: data.url, mime: data.mime, size: data.size });
        }
      } catch {
        /* skip failed uploads */
      }
    }

    setAttachments((prev) => [...prev, ...uploaded]);
    setUploading(false);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex-shrink-0">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 dark:text-gray-300 group"
            >
              {att.mime.startsWith('image/') ? <ImageIcon size={14} /> : <FileText size={14} />}
              <span className="max-w-[120px] truncate">{att.name}</span>
              <button
                onClick={() => removeAttachment(i)}
                className="text-gray-400 hover:text-red-500 transition-colors ml-1"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          {uploading && (
            <div className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5 text-sm text-blue-600">
              <span className="animate-spin">⟳</span> Uploading…
            </div>
          )}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          className="flex-shrink-0 h-12 w-12 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-all duration-150 disabled:opacity-40"
          title="Attach file"
        >
          <Paperclip size={22} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,.pdf,.txt,.md,.json,.csv,.xlsx,.docx"
          onChange={handleFileSelect}
        />

        {/* Text area */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          autoFocus
          className="
            flex-1 resize-none bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100
            rounded-xl px-4 py-2.5 text-base
            border-2 border-transparent dark:border-gray-700
            focus:outline-none focus:bg-white dark:focus:bg-gray-700 focus:border-blue-500
            transition-all duration-200
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            overflow-y-auto
            disabled:opacity-50
            leading-relaxed
          "
          style={{ maxHeight: '200px', minHeight: '44px' }}
        />

        {/* Send / Stop button */}
        {onStop ? (
          <button
            type="button"
            onClick={onStop}
            className="
              flex-shrink-0 h-12 w-12 flex items-center justify-center
              rounded-lg transition-all duration-150
              bg-red-500 text-white hover:bg-red-600 active:scale-95
            "
            title="Stop generation"
          >
            <Square size={22} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="
              flex-shrink-0 h-12 w-12 flex items-center justify-center
              rounded-lg transition-all duration-150
              bg-blue-500 text-white
              hover:bg-blue-600 hover:scale-105
              active:scale-95
              disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100
            "
            title="Send message (Enter)"
          >
            <Send size={22} />
          </button>
        )}
      </div>

      <div className="h-1" />
      {/* <p className="text-center text-sm text-gray-400 dark:text-gray-600 mt-2">
        Enter to send · Shift+Enter for newline · Paste image to attach
      </p> */}
    </div>
  );
}
