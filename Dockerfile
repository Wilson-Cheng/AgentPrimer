# ─── Stage 1: install dependencies (compiles better-sqlite3 native binding) ───
FROM node:20-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: build Next.js ───────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Stage 3: production runner ───────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/lib/function-tool-worker.js ./lib/function-tool-worker.js
COPY --from=builder /app/lib/agent ./lib/agent
COPY --from=builder /app/defaults ./defaults
COPY package.json next.config.ts tsconfig.json ./

RUN apt-get update && apt-get install -y --no-install-recommends \
    pandoc \
    tesseract-ocr \
    tesseract-ocr-eng \
    ffmpeg \
    sox \
    poppler-utils \
    fonts-noto-core \
    fonts-noto-cjk \
    sqlite3 \
    python3 \
    python3-pip \
    python3-venv \
    chromium \
    weasyprint \
    libreoffice-impress \
    net-tools \
    dnsutils \
    inetutils-traceroute \
    curl \
    wget \
    nmap \
    tcpdump \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @mermaid-js/mermaid-cli
RUN pip install --break-system-packages python-pptx

# gtts (text-to-speech) is an optional agent tool. Local RAG embeddings no
# longer use Python — they run in-process via @huggingface/transformers.
RUN python3 -m venv /app/venv && \
    . /app/venv/bin/activate && \
    pip install --no-cache-dir "click<8.2" gtts && \
    ln -sf /app/venv/bin/gtts-cli /usr/local/bin/gtts-cli

RUN mkdir -p /app/data

# Runs as root: the agent's run_shell / installer flows need to apt/npm/pip
# install tools non-interactively at runtime. Treat the container as a
# single-tenant trusted environment and keep it off public networks.
EXPOSE 15432

CMD ["node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "-p", "15432"]
