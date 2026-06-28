#!/bin/sh
# AgentPrimer production startup script
# Always starts the local embedding sidecar, then Next.js.
#
# Environment variables:
#   EMBED_PORT    sidecar port (default 15434)
#   EMBED_MODEL   model name (default sentence-transformers/all-MiniLM-L6-v2)
#
# The sidecar starts even if no embedding library is installed — it will
# serve /health with {"status":"degraded"} until a library is available.
# The user switches between Local and OpenAI embeddings in Settings.
#
# The container runs as root by design: the agent's run_shell and the
# skill/MCP installers need to install OS/npm/pip packages non-interactively
# at runtime. Treat the container as a single-tenant trusted environment and
# keep it off public networks.

set -e

EMBED_PORT="${EMBED_PORT:-15434}"

mkdir -p /app/data

echo "[start] Starting embedding sidecar (port $EMBED_PORT)..."
/app/venv/bin/python /app/scripts/embed_server.py &
SIDECAR_PID=$!

# Wait up to 60 s for the sidecar HTTP server to respond
READY=0
for i in $(seq 1 60); do
    if wget -q -O- "http://127.0.0.1:${EMBED_PORT}/health" >/dev/null 2>&1; then
        echo "[start] Embedding sidecar ready."
        READY=1
        break
    fi
    sleep 1
done

if [ "$READY" = "0" ]; then
    echo "[start] WARNING: embedding sidecar did not start within 60 s. Continuing anyway."
fi

trap "kill $SIDECAR_PID 2>/dev/null; exit" TERM INT

# Use exec so Next.js becomes PID 1 and receives Docker SIGTERM directly
exec node_modules/.bin/next start --hostname 0.0.0.0 -p 15432
