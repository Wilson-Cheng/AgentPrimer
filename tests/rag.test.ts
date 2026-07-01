import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

let tempDir: string;

async function loadRag() {
  vi.resetModules();
  return import('../lib/rag');
}

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprimer-rag-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
});

afterEach(() => {
  vi.doUnmock('../lib/embeddings');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('RAG pipeline', () => {
  it('chunks text with overlap and preserves paragraph boundaries where possible', async () => {
    const { chunkText } = await loadRag();
    const text = `${'a'.repeat(900)}\n\n${'b'.repeat(900)}\n\n${'c'.repeat(900)}`;

    const chunks = chunkText(text);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 1600)).toBe(true);
    expect(chunks.join('\n')).toContain('bbbb');
  });

  it('returns no chunks for blank text', async () => {
    const { chunkText } = await loadRag();

    expect(chunkText('  \n\n  ')).toEqual([]);
  });

  it('ingests documents, skips identical re-ingestion, and retrieves via vector search', async () => {
    vi.doMock('../lib/embeddings', () => ({
      LOCAL_EMBED_MODEL: 'Xenova/all-MiniLM-L6-v2',
      embedLocal: vi.fn(async (texts: string[]) =>
        texts.map((text) => (text.toLowerCase().includes('banana') ? [1, 0] : [0, 1])),
      ),
      localEmbedHealth: vi.fn(async () => ({
        ok: true,
        status: 'ok',
        model: 'Xenova/all-MiniLM-L6-v2',
        backend: 'mock',
      })),
    }));

    const { ingestDocument, retrieveChunks } = await loadRag();
    const { setSetting } = await import('../lib/db');

    setSetting('embedding_provider', 'local');

    const first = await ingestDocument({
      name: 'fruit-notes',
      content: 'Banana smoothies are yellow and sweet.\n\nCar engines need oil and maintenance.',
    });
    const second = await ingestDocument({
      name: 'fruit-notes',
      content: 'Banana smoothies are yellow and sweet.\n\nCar engines need oil and maintenance.',
    });

    expect(first).toMatchObject({ chunks: 1, embedded: true, skipped: false });
    expect(second).toMatchObject({
      sourceId: first.sourceId,
      chunks: 1,
      embedded: true,
      skipped: true,
    });

    const results = await retrieveChunks('banana recipe', 1);

    expect(results).toHaveLength(1);
    expect(results[0]).toContain('Banana smoothies');
  });

  it('falls back to FTS5 search when embeddings are unavailable', async () => {
    vi.doMock('../lib/embeddings', () => ({
      LOCAL_EMBED_MODEL: 'Xenova/all-MiniLM-L6-v2',
      embedLocal: vi.fn(async () => null),
      localEmbedHealth: vi.fn(async () => ({
        ok: false,
        status: 'degraded',
        model: 'Xenova/all-MiniLM-L6-v2',
        backend: 'mock',
        error: 'down',
      })),
    }));

    const { ingestDocument, retrieveChunks } = await loadRag();
    const { setSetting } = await import('../lib/db');

    setSetting('embedding_provider', 'local');

    const ingested = await ingestDocument({
      name: 'fallback-notes',
      content: 'The alpha project uses SQLite WAL mode.\n\nThe beta project uses PostgreSQL.',
    });

    expect(ingested.embedded).toBe(false);
    expect(await retrieveChunks('SQLite WAL', 2)).toEqual([
      'The alpha project uses SQLite WAL mode.\n\nThe beta project uses PostgreSQL.',
    ]);
    expect(await retrieveChunks('"unterminated query:', 2)).toEqual([]);
  });
});
