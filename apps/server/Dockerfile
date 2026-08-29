# ──────────────────────────────────────────────────────
# JobTailor Server — Docker Production Build
# ──────────────────────────────────────────────────────
# Multi-stage: build → runtime (with Chromium for Puppeteer)
#
# IMPORTANT: build context must be the MONOREPO ROOT
# (see docker-compose.yml: build.context = .)
# ──────────────────────────────────────────────────────

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace manifests first for dependency layer caching
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/client/package.json ./apps/client/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci

# Copy shared packages and server source
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY apps/server/tsconfig.json ./apps/server/
COPY apps/server/src ./apps/server/src

RUN npm run build --workspace=job-tailor-server

# Stage 2: Runtime (includes Chrome for PDF generation)
FROM node:22-slim AS runner

# Install Chromium dependencies for Puppeteer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0t64 \
    libatk1.0-0t64 \
    libcups2t64 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libatspi2.0-0t64 \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy built artifacts and runtime dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types ./packages/shared-types
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./

# Non-root user for security
RUN useradd -m -r jobtailor && chown -R jobtailor:jobtailor /app
USER jobtailor

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/app.js"]
