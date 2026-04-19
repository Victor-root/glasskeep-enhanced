# syntax=docker/dockerfile:1.7
# =============================================================================
#  GlassKeep — Dockerfile (multi-stage)
#  Builds the React/Vite front-end and runs the Express API (better-sqlite3).
#  Data (SQLite DB + JWT secret) is persisted in /data — mount it as a volume.
# =============================================================================

# ─────────────────────────── Stage 1: build ──────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Native build tools required to compile better-sqlite3 from source.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Install all deps (including dev) so Vite can build.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy sources.
COPY . .

# Build the front-end (outputs to /app/dist). @huggingface/transformers is
# only imported by the server, never by the front-end, so this succeeds
# regardless of what we do with server-side AI below.
RUN npm run build

# Docker image ships without server-side AI. @huggingface/transformers and
# its transitive deps (onnxruntime, sharp...) add ~250 MB for a feature
# that's already disabled by default in server/index.js (the initServerAI
# call is commented out). The server imports it lazily inside a try/catch,
# so dropping the package requires no code change.
#
# We edit package.json *in the builder layer only* — the repo on disk is
# untouched — then prune so transitive deps get cleaned up too. The native
# install path (install.sh) keeps the AI features.
RUN node -e "const fs=require('fs'); const p=JSON.parse(fs.readFileSync('package.json')); delete p.dependencies['@huggingface/transformers']; fs.writeFileSync('package.json', JSON.stringify(p,null,2)+'\n');" \
 && npm prune --omit=dev --no-audit --no-fund

# ─────────────────────────── Stage 2: runtime ────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# tini: proper PID 1 / signal handling. gosu: drop privileges cleanly.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini gosu ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Copy only what's needed to run.
COPY --from=builder /app/dist           ./dist
COPY --from=builder /app/server         ./server
COPY --from=builder /app/node_modules   ./node_modules
COPY --from=builder /app/package.json   ./package.json

COPY docker/entrypoint.sh        /usr/local/bin/entrypoint.sh
COPY docker/bootstrap-admin.js   /app/server/bootstrap-admin.js
RUN chmod +x /usr/local/bin/entrypoint.sh

# Persistent data directory (SQLite DB + generated JWT secret).
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

# Docker image is HTTP-only by design — put it behind a reverse proxy for
# HTTPS. HTTPS_ENABLED is pinned off so the runtime never tries to read a
# cert even if SSL_CERT/SSL_KEY leak in from the environment.
ENV NODE_ENV=production \
    API_PORT=8080 \
    DB_FILE=/data/notes.db \
    HTTPS_ENABLED=false

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.API_PORT||8080)+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini","--","/usr/local/bin/entrypoint.sh"]
CMD ["node","server/index.js"]
