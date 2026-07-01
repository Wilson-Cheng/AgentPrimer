/**
 * lib/rag.ts
 * ---------------------------------------------------------------------------
 * Retrieval-Augmented Generation (RAG) pipeline.
 *
 * Pipeline overview
 * -----------------
 *   Ingest:   content → chunk → embed (batch) → store in SQLite
 *   Retrieve: query → embed → cosine rank → top-k chunks
 *             (falls back to FTS5 keyword search when embeddings unavailable)
 *
 * Embedding backends (configured via Settings → Embedding Provider):
 *   local  — in-process @huggingface/transformers (all-MiniLM-L6-v2 ONNX)
 *   openai — OpenAI-compatible embeddings API   (text-embedding-3-small)
 *
 * Vector storage: embeddings are JSON TEXT columns in knowledge_chunks.
 * Retrieval: pure-JS cosine similarity — O(n) scan, fast for ≤ 50 k chunks.
 * For larger collections, drop in sqlite-vec without changing the API surface.
 */

import { getDb, getSetting } from './db';
import { embedLocal, localEmbedHealth, LOCAL_EMBED_MODEL } from './embeddings';
import crypto from 'crypto';
import OpenAI from 'openai';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeSource {
  id: number;
  name: string;
  source_type: string;
  embedding_model: string | null;
  chunk_count: number;
  ingested_at: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CHUNK_SIZE = 1600; // ≈ 400 tokens  (1 token ≈ 4 chars for English prose)
const CHUNK_OVERLAP = 200; // ≈  50 tokens overlap — preserves cross-boundary sentences
const EMBEDDING_BATCH_SIZE = 50; // max texts per embedding API call

// ── Private helpers ───────────────────────────────────────────────────────────

function md5(text: string): string {
  return crypto.createHash('md5').update(text, 'utf8').digest('hex');
}

/**
 * Split text into overlapping chunks of roughly CHUNK_SIZE characters.
 * Prefers paragraph breaks (double newline) as split points.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  if (normalized.length <= CHUNK_SIZE) return [normalized];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    // Try to break at a paragraph boundary near the end of the chunk window
    if (end < normalized.length) {
      const paraBreak = normalized.lastIndexOf('\n\n', end);
      if (paraBreak > start + CHUNK_SIZE * 0.6) end = paraBreak + 2;
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks.filter((c) => c.length > 0);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-8);
}

/**
 * Returns a stable model identifier for the current embedding configuration.
 * Stored on knowledge_sources so we can filter chunks by model at retrieval time.
 */
export function currentModelId(): string {
  const provider = getSetting('embedding_provider') || 'local';
  if (provider === 'local') {
    return `local:${LOCAL_EMBED_MODEL}`;
  }
  const model = getSetting('embedding_model') || 'text-embedding-3-small';
  return `openai:${model}`;
}

// ── Embedding ─────────────────────────────────────────────────────────────────

/**
 * Embed a list of texts using the configured provider.
 * Returns null if the provider is unavailable; throws on unexpected network errors.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const provider = getSetting('embedding_provider') || 'local';

  if (provider === 'local') {
    // In-process embedding via @huggingface/transformers (no sidecar).
    // Returns null when the model/library is unavailable so callers fall
    // back to FTS5 keyword search.
    return embedLocal(texts);
  }

  // OpenAI-compatible API
  // Embedding endpoint/key/model can be set independently of the chat
  // endpoint; fall back to the chat endpoint/key when not provided so
  // existing single-endpoint configs keep working.
  const apiKey = getSetting('embedding_api_key') || getSetting('api_key');
  const baseURL =
    getSetting('embedding_endpoint') || getSetting('endpoint') || 'https://api.openai.com/v1';
  const model = getSetting('embedding_model') || 'text-embedding-3-small';
  if (!apiKey) {
    console.error('[rag] openai embedding: no api_key configured');
    return null;
  }
  try {
    const openai = new OpenAI({ apiKey, baseURL });
    const resp = await openai.embeddings.create({ model, input: texts });
    return resp.data.map((d) => d.embedding);
  } catch (e) {
    console.error('[rag] openai embed failed:', e);
    return null;
  }
}

/** Check whether the configured embedding provider is reachable and ready. */
export async function checkEmbedHealth(): Promise<{
  ok: boolean;
  status: string;
  model?: string;
  backend?: string;
  error?: string;
}> {
  const provider = getSetting('embedding_provider') || 'local';

  if (provider === 'local') {
    return localEmbedHealth();
  }

  const hasKey = !!(getSetting('embedding_api_key') || getSetting('api_key'));
  const model = getSetting('embedding_model') || 'text-embedding-3-small';
  return {
    ok: hasKey,
    status: hasKey ? 'ok' : 'no_key',
    model,
    error: hasKey ? undefined : 'No API key configured in Settings',
  };
}

// ── Ingestion ─────────────────────────────────────────────────────────────────

export async function ingestDocument(params: {
  name: string;
  sourceType?: string;
  content: string;
  /** Original document for the RAG page View panel.
   *  Verbatim text for text/markdown/html. */
  originalContent?: string;
  /** Raw bytes — used for PDFs. */
  originalBytes?: Buffer | Uint8Array;
  originalMime?: string;
}): Promise<{ sourceId: number; chunks: number; embedded: boolean; skipped: boolean }> {
  const db = getDb();
  const hash = md5(params.content);
  const model = currentModelId();

  // Idempotent: skip if identical content + model already ingested
  const existing = db
    .prepare(
      'SELECT id, chunk_count FROM knowledge_sources WHERE name = ? AND content_md5 = ? AND embedding_model = ?',
    )
    .get(params.name, hash, model) as { id: number; chunk_count: number } | undefined;
  if (existing) {
    return { sourceId: existing.id, chunks: existing.chunk_count, embedded: true, skipped: true };
  }

  const chunks = chunkText(params.content);
  if (chunks.length === 0) throw new Error('Document produced no text after chunking');

  // Embed all chunks in batches; keep nulls for chunks where embed failed
  const embeddings: (number[] | null)[] = new Array(chunks.length).fill(null);
  let embedded = false;
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
    const vecs = await embedTexts(batch);
    if (vecs) {
      for (let j = 0; j < vecs.length; j++) embeddings[i + j] = vecs[j];
      embedded = true;
    }
  }

  // Default originalContent/originalMime: when not supplied, store the
  // extracted text as text/plain so the View button still has something
  // to show. Callers with PDF bytes pass `originalBytes`.
  const originalMime = params.originalMime ?? 'text/plain';
  const isPdf = originalMime === 'application/pdf';
  const originalText = isPdf ? null : (params.originalContent ?? params.content);
  const originalBlob = isPdf
    ? params.originalBytes
      ? Buffer.from(params.originalBytes)
      : null
    : null;

  // Atomic ingest: delete any previous same-name row + insert the new
  // source + insert all chunks inside ONE transaction. This is critical for
  // the new cancel/rollback flow — if a caller cancels mid-pipeline,
  // better-sqlite3's synchronous transaction has already committed by the
  // time the caller can react, so we never end up with a half-deleted row.
  const insertSource = db.prepare(
    `INSERT INTO knowledge_sources (name, source_type, content_md5, embedding_model, chunk_count, original_content, original_blob, original_mime)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const deleteOld = db.prepare('DELETE FROM knowledge_sources WHERE name = ?');
  const insertChunk = db.prepare(
    'INSERT INTO knowledge_chunks (source_id, chunk_index, chunk_text, embedding) VALUES (?, ?, ?, ?)',
  );

  const sourceId = db.transaction((): number => {
    deleteOld.run(params.name);
    const { lastInsertRowid } = insertSource.run(
      params.name,
      params.sourceType ?? 'file_upload',
      hash,
      embedded ? model : null,
      chunks.length,
      originalText,
      originalBlob,
      originalMime,
    );
    const sid = Number(lastInsertRowid);
    for (let i = 0; i < chunks.length; i++) {
      const emb = embeddings[i];
      insertChunk.run(sid, i, chunks[i], emb ? JSON.stringify(emb) : null);
    }
    return sid;
  })();

  // Rebuild FTS5 index to include the new chunks
  db.prepare("INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')").run();

  return { sourceId, chunks: chunks.length, embedded, skipped: false };
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

/**
 * Retrieve the top-k most relevant text chunks for a query.
 *
 * Strategy:
 *   1. If chunks with the current model's embeddings exist → vector search
 *   2. Otherwise → FTS5 keyword search (always available, never empty)
 */
export async function retrieveChunks(query: string, topK = 5): Promise<string[]> {
  const db = getDb();
  const model = currentModelId();

  // Load chunks that were embedded with the current model
  const rows = db
    .prepare(
      `SELECT kc.chunk_text, kc.embedding
     FROM knowledge_chunks kc
     JOIN knowledge_sources ks ON kc.source_id = ks.id
     WHERE ks.embedding_model = ? AND kc.embedding IS NOT NULL`,
    )
    .all(model) as Array<{ chunk_text: string; embedding: string }>;

  if (rows.length > 0) {
    const vecs = await embedTexts([query]);
    if (vecs) {
      const qv = vecs[0];
      const scored = rows.map((r) => ({
        text: r.chunk_text,
        score: cosineSimilarity(qv, JSON.parse(r.embedding) as number[]),
      }));
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, topK).map((r) => r.text);
    }
  }

  // FTS5 keyword fallback — sanitize input to avoid FTS5 syntax errors
  const safe = query.replace(/["*()[\]{}^~?:\\]/g, ' ').trim();
  if (!safe) return [];
  try {
    const fts = db
      .prepare(
        `SELECT kc.chunk_text
       FROM knowledge_fts kf
       JOIN knowledge_chunks kc ON kf.rowid = kc.id
       WHERE knowledge_fts MATCH ?
       LIMIT ?`,
      )
      .all(safe, topK) as Array<{ chunk_text: string }>;
    return fts.map((r) => r.chunk_text);
  } catch {
    // FTS5 may still reject malformed queries; degrade to empty result
    return [];
  }
}

// ── Source management ─────────────────────────────────────────────────────────

export function listSources(): KnowledgeSource[] {
  return getDb()
    .prepare(
      `SELECT id, name, source_type, embedding_model, chunk_count, ingested_at
     FROM knowledge_sources
     ORDER BY ingested_at DESC`,
    )
    .all() as KnowledgeSource[];
}

export function deleteSource(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM knowledge_sources WHERE id = ?').run(id);
  db.prepare("INSERT INTO knowledge_fts(knowledge_fts) VALUES('rebuild')").run();
}

/** Return just the metadata for a source — no large blob columns selected.
 *  Used by the View panel to decide which renderer to use without paying
 *  for the multi-MB content fetch on PDFs. */
export function getSourceMeta(id: number): {
  id: number;
  name: string;
  mime: string;
} | null {
  const row = getDb()
    .prepare(`SELECT id, name, original_mime FROM knowledge_sources WHERE id = ?`)
    .get(id) as { id: number; name: string; original_mime: string | null } | undefined;
  if (!row) return null;
  return { id: row.id, name: row.name, mime: row.original_mime ?? 'text/plain' };
}

/** Return the original (pre-chunk) document for the View panel.
 *  - For text/markdown/html: `content` is the verbatim text and `bytes` is null.
 *  - For application/pdf:    `bytes` is the raw PDF buffer and `content` is empty.
 *  Returns null when the source doesn't exist. */
export function getSourceContent(id: number): {
  id: number;
  name: string;
  mime: string;
  content: string;
  bytes: Buffer | null;
} | null {
  const row = getDb()
    .prepare(
      `SELECT id, name, original_content, original_blob, original_mime
     FROM knowledge_sources WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        name: string;
        original_content: string | null;
        original_blob: Buffer | null;
        original_mime: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    mime: row.original_mime ?? 'text/plain',
    content: row.original_content ?? '',
    bytes: row.original_blob ?? null,
  };
}

export function getSourceCount(): number {
  return (getDb().prepare('SELECT COUNT(*) as n FROM knowledge_sources').get() as { n: number }).n;
}
