# syntax=docker/dockerfile:1.7
# =============================================================================
#  GlassKeep — Dockerfile (multi-stage)
#  Builds the React/Vite front-end and runs the Express API (better-sqlite3).
#  Data (SQLite DB + JWT secret) is persisted in /data — mount it as a volume.
# =============================================================================

# ─────────────────────────── Stage 1: build ──────────────────────────────────
FROM node:24-bookworm-slim AS builder

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

# Build the front-end (outputs to /app/dist).
RUN npm run build

# Drop devDependencies — production runtime only needs the server code
# and its prod deps. The embedded local AI model (and its 250 MB of
# transitive deps) is gone; AI now talks to an external OpenAI-compatible
# endpoint over HTTP, so no extra trim step is needed here.
RUN npm prune --omit=dev --no-audit --no-fund

# ─────────────────────────── Stage 2: runtime ────────────────────────────────
FROM node:24-bookworm-slim AS runtime

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
