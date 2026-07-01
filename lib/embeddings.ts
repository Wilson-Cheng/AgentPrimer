/**
 * lib/embeddings.ts
 * ---------------------------------------------------------------------------
 * In-process local embedding backend (pure Node.js — no Python sidecar).
 *
 * Replaces the old `scripts/embed_server.py` Python HTTP sidecar. The exact
 * same ONNX model (`all-MiniLM-L6-v2`, 384-dim) is now run directly inside
 * the Next.js server via @huggingface/transformers (Transformers.js +
 * onnxruntime-node). No extra process, no port, no Python.
 *
 * Design notes
 * ------------
 *  - The model is loaded lazily on first use and cached for the process
 *    lifetime. The first embed call downloads the model (~90 MB) into
 *    `data/models/` (configurable via EMBED_CACHE_DIR) and is therefore slow;
 *    subsequent calls are fast.
 *  - If @huggingface/transformers is not installed or the model fails to load
 *    (e.g. offline first run, unsupported platform), we degrade gracefully:
 *    getLocalEmbedder() returns null and lib/rag.ts falls back to FTS5
 *    keyword search — exactly like the old "degraded" sidecar mode.
 *  - The dynamic import keeps @huggingface/transformers out of the bundle and
 *    out of the hot path for users who only use the OpenAI embedding provider.
 */

import path from 'path';

export const LOCAL_EMBED_MODEL = process.env.EMBED_MODEL || 'Xenova/all-MiniLM-L6-v2';

const CACHE_DIR = process.env.EMBED_CACHE_DIR || path.join(process.cwd(), 'data', 'models');

// Pipeline type is loaded dynamically; keep it loose to avoid a hard dependency
// on the package's types at compile time.
type FeatureExtractionPipeline = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let _pipelinePromise: Promise<FeatureExtractionPipeline | null> | null = null;
let _status: 'unloaded' | 'loading' | 'ready' | 'unavailable' = 'unloaded';
let _loadError: string | undefined;

async function loadPipeline(): Promise<FeatureExtractionPipeline | null> {
  _status = 'loading';
  try {
    // Dynamic import so the package is optional and never bundled.
    const transformers = await import('@huggingface/transformers');
    const { pipeline, env } = transformers;

    // Cache models under data/models so the Docker volume persists them.
    env.cacheDir = CACHE_DIR;
    // Allow downloading from the Hugging Face hub on first run.
    env.allowRemoteModels = true;

    const extractor = (await pipeline(
      'feature-extraction',
      LOCAL_EMBED_MODEL,
    )) as unknown as FeatureExtractionPipeline;

    _status = 'ready';
    return extractor;
  } catch (e) {
    _status = 'unavailable';
    _loadError = e instanceof Error ? e.message : 'failed to load embedding model';
    console.warn(
      `[embeddings] local embedder unavailable (${_loadError}); ` +
        'falling back to FTS5 keyword search. ' +
        'Install with: npm install @huggingface/transformers',
    );
    return null;
  }
}

/**
 * Lazily load and return the local embedding pipeline.
 * Returns null when the embedding library/model is unavailable.
 */
export async function getLocalEmbedder(): Promise<FeatureExtractionPipeline | null> {
  if (!_pipelinePromise) {
    _pipelinePromise = loadPipeline();
  }
  return _pipelinePromise;
}

/**
 * Embed a list of texts locally. Returns null when the local embedder is
 * unavailable (caller should fall back to FTS5).
 */
export async function embedLocal(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const extractor = await getLocalEmbedder();
  if (!extractor) return null;
  try {
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  } catch (e) {
    console.error('[embeddings] local embed failed:', e);
    return null;
  }
}

/** Health/status of the in-process local embedder. */
export async function localEmbedHealth(): Promise<{
  ok: boolean;
  status: string;
  model: string;
  backend: string;
  error?: string;
}> {
  // Trigger a load if it hasn't happened yet so the first health check is
  // meaningful rather than always reporting "unloaded".
  await getLocalEmbedder();
  if (_status === 'ready') {
    return {
      ok: true,
      status: 'ok',
      model: LOCAL_EMBED_MODEL,
      backend: 'transformers.js',
    };
  }
  return {
    ok: false,
    status: 'degraded',
    model: LOCAL_EMBED_MODEL,
    backend: 'unavailable',
    error: _loadError || 'embedding model not loaded; install @huggingface/transformers',
  };
}
