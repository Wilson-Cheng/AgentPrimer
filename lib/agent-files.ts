/**
 * lib/agent-files.ts
 * ---------------------------------------------------------------------------
 * Utility functions for storing files that the agent sends to the user.
 *
 * Files are saved to  data/agent-files/<uuid>/<sanitized-filename>
 * and served back via  GET /api/files/<uuid>/<filename>
 *
 * Only the metadata (id, filename, mime_type, size, url) is stored in the
 * session's tool_calls_json — never the raw bytes — so session history stays
 * compact regardless of file size.
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR } from './db';

export const AGENT_FILES_DIR = path.join(DATA_DIR, 'agent-files');

function ensureDir(): void {
  if (!fs.existsSync(AGENT_FILES_DIR)) {
    fs.mkdirSync(AGENT_FILES_DIR, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// MIME type detection by file extension
// ---------------------------------------------------------------------------
const MIME_MAP: Record<string, string> = {
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  // Video
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.m4v': 'video/mp4',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.m4a': 'audio/mp4',
  '.opus': 'audio/opus',
  // Text / code
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.csv': 'text/csv',
  '.xml': 'text/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  // Data
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.7z': 'application/x-7z-compressed',
  // Office
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Code
  '.py': 'text/x-python',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.sh': 'text/x-sh',
};

export function detectMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// Result type returned by the send_file tool (also stored in tool_calls_json)
// ---------------------------------------------------------------------------
export interface AgentFileResult {
  type: 'agent_file';
  id: string;
  filename: string;
  mime_type: string;
  size: number;
  /** Relative URL served by /api/files/[id]/[filename] */
  url: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Sanitize filename to be safe for use in file paths and URLs
// ---------------------------------------------------------------------------
function sanitizeFilename(raw: string): string {
  return path.basename(raw).replace(/[^a-zA-Z0-9._\-]/g, '_') || 'file';
}

// ---------------------------------------------------------------------------
// Save inline content (base64 or utf-8 text)
// ---------------------------------------------------------------------------
export function saveAgentFile(
  filename: string,
  content: string,
  encoding: 'base64' | 'utf8' = 'base64',
  description?: string,
  mimeOverride?: string,
): AgentFileResult {
  ensureDir();
  const id = randomUUID();
  const safe = sanitizeFilename(filename);
  const dir = path.join(AGENT_FILES_DIR, id);
  fs.mkdirSync(dir, { recursive: true });

  const buf = encoding === 'base64'
    ? Buffer.from(content, 'base64')
    : Buffer.from(content, 'utf8');
  fs.writeFileSync(path.join(dir, safe), buf);

  return buildResult(id, safe, dir, description, mimeOverride);
}

// ---------------------------------------------------------------------------
// Copy an existing on-disk file into the agent-files store
// ---------------------------------------------------------------------------
export function copyFileToAgentFiles(
  sourcePath: string,
  filenameOverride?: string,
  description?: string,
  mimeOverride?: string,
): AgentFileResult {
  ensureDir();
  const id = randomUUID();
  const safe = sanitizeFilename(filenameOverride ?? path.basename(sourcePath));
  const dir = path.join(AGENT_FILES_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(sourcePath, path.join(dir, safe));
  return buildResult(id, safe, dir, description, mimeOverride);
}

// ---------------------------------------------------------------------------
// Internal: build the result object after saving
// ---------------------------------------------------------------------------
function buildResult(
  id: string,
  filename: string,
  dir: string,
  description?: string,
  mimeOverride?: string,
): AgentFileResult {
  const size = fs.statSync(path.join(dir, filename)).size;
  const mime_type = mimeOverride ?? detectMimeType(filename);
  return {
    type: 'agent_file',
    id,
    filename,
    mime_type,
    size,
    url: `/api/files/${id}/${encodeURIComponent(filename)}`,
    description,
  };
}
