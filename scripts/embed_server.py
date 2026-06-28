#!/usr/bin/env python3
"""
AgentPrimer — local embedding sidecar
======================================
A minimal HTTP server (stdlib only — no FastAPI/uvicorn dependency) that
exposes two endpoints:

  GET  /health        → {"status":"ok","model":"..."}
  POST /embed         → {"texts":["...",...]}
                      ← {"embeddings":[[0.023,...],...]}

Environment variables:
  EMBED_PORT   default 15434
  EMBED_MODEL  default "sentence-transformers/all-MiniLM-L6-v2"

Model backend selection (in priority order):
  1. fastembed  — ONNX-based, no PyTorch, works on Alpine via gcompat (~200 MB)
  2. sentence-transformers — requires PyTorch, works on Debian/macOS/Windows

The server logs one line when ready:
  [embed-server] ready model=... port=...

AgentPrimer's lib/rag.ts calls this on every embed() invocation when
embeddingProvider is set to "local" in Settings.
"""

import os
import sys
import json
import logging
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

PORT = int(os.environ.get("EMBED_PORT", "15434"))
MODEL_NAME = os.environ.get("EMBED_MODEL", "sentence-transformers/all-MiniLM-L6-v2")

# Resolve data/models/ relative to the project root (one level above scripts/).
# Works for both dev  (/workspaces/AgentPrimer/data/models)
# and production Docker (/app/data/models — the persisted volume).
# Override with EMBED_CACHE_DIR env var if needed.
_project_root = Path(__file__).resolve().parent.parent
CACHE_DIR = os.environ.get(
    "EMBED_CACHE_DIR",
    str(_project_root / "data" / "models"),
)
Path(CACHE_DIR).mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.WARNING)  # suppress INFO from onnxruntime

# ── Load the embedding model ──────────────────────────────────────────────────
_model = None
_backend = None

def _load_model():
    global _model, _backend

    # Try fastembed first (ONNX, no torch, Alpine-compatible via gcompat)
    try:
        from fastembed import TextEmbedding
        print(f"[embed-server] loading via fastembed: {MODEL_NAME} (cache: {CACHE_DIR})", flush=True)
        _model = TextEmbedding(MODEL_NAME, cache_dir=CACHE_DIR)
        _backend = "fastembed"
        return
    except ImportError:
        pass

    # Fall back to sentence-transformers (requires PyTorch)
    try:
        from sentence_transformers import SentenceTransformer
        print(f"[embed-server] loading via sentence-transformers: {MODEL_NAME}", flush=True)
        _model = SentenceTransformer(MODEL_NAME, device="cpu")
        _backend = "sentence-transformers"
        return
    except ImportError:
        pass

    print("[embed-server] WARNING: neither fastembed nor sentence-transformers is installed.", flush=True)
    print("  The server will start but /embed will return 503 until a library is installed.", flush=True)
    print("  Install one of:  pip install fastembed   OR   pip install sentence-transformers", flush=True)
    _backend = "unavailable"


def _embed(texts: list) -> list:
    """Embed a list of strings. Returns list of float lists."""
    if _backend == "fastembed":
        # fastembed.embed() returns a generator of numpy arrays
        return [v.tolist() for v in _model.embed(texts)]
    else:
        # sentence-transformers returns a numpy matrix
        matrix = _model.encode(texts, normalize_embeddings=True)
        return matrix.tolist()


# ── HTTP handler ──────────────────────────────────────────────────────────────

class EmbedHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Suppress per-request logs — they fill up Docker logs with noise
        pass

    def _send_json(self, status: int, body: dict):
        data = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            if _model is None:
                self._send_json(200, {
                    "status": "degraded",
                    "model": MODEL_NAME,
                    "backend": "unavailable",
                    "error": "no embedding library installed; run: pip install fastembed",
                })
            else:
                self._send_json(200, {"status": "ok", "model": MODEL_NAME, "backend": _backend})
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/embed":
            self._send_json(404, {"error": "not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid JSON"})
            return

        texts = body.get("texts")
        if not isinstance(texts, list) or len(texts) == 0:
            self._send_json(400, {"error": "texts must be a non-empty array"})
            return

        if _model is None:
            self._send_json(503, {"error": "no embedding backend installed; run: pip install fastembed"})
            return
        try:
            embeddings = _embed(texts)
            self._send_json(200, {"embeddings": embeddings})
        except Exception as e:
            self._send_json(500, {"error": str(e)})


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _load_model()
    try:
        server = HTTPServer(("127.0.0.1", PORT), EmbedHandler)
    except OSError as e:
        if e.errno == 98:  # EADDRINUSE
            print(f"[embed-server] port {PORT} already in use — existing instance is running, exiting.", flush=True)
            sys.exit(0)
        raise
    if _model is None:
        print(f"[embed-server] started (degraded — no embedding library) port={PORT}", flush=True)
    else:
        print(f"[embed-server] ready model={MODEL_NAME} backend={_backend} port={PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
