# Multi-stage build for Telegram bot with optimized caching
FROM node:22-slim AS base

# Install essential build dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    git \
    dumb-init \
    openssl \
    libssl-dev \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@8.15.6

WORKDIR /app

# Copy dependency files first for better layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/*/package.json ./packages/
COPY apps/bot/package.json ./apps/bot/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build bot application
RUN pnpm run build --filter=@weship/bot

# Production stage - minimal runtime image
FROM node:22-slim AS production

# Install only essential runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    openssl \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g pnpm@8.15.6

WORKDIR /app

# Copy only production dependencies and built files
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/*/package.json ./packages/
COPY apps/bot/package.json ./apps/bot/

# Install production dependencies only (skip native modules that need compilation)
RUN pnpm install --prod --frozen-lockfile --ignore-scripts

# Copy built application and runtime files
COPY --from=base /app/apps/bot/dist ./apps/bot/dist
COPY --from=base /app/apps/bot/drizzle.config.ts ./apps/bot/
COPY --from=base /app/apps/bot/src/db ./apps/bot/src/db

# Security: Use non-root user
RUN chown -R node:node /app
USER node

# Expose port and configure health check
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init for proper signal handling in containers
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/bot/dist/index.js"]
