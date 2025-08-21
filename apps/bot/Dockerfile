# Use Node.js 18 Alpine as base image
FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm@8.15.6

# Set working directory
WORKDIR /app

# Copy workspace configuration files
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./

# Copy all package.json files for dependency resolution
COPY apps/bot/package.json ./apps/bot/
COPY packages/*/package.json ./packages/*/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build stage
FROM base AS builder

# Build the bot application
RUN pnpm run build --filter=@weship/bot

# Production stage
FROM node:18-alpine AS production

# Install pnpm
RUN npm install -g pnpm@8.15.6

# Create app directory
WORKDIR /app

# Copy package files for production install
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/*/package.json ./packages/*/

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod

# Copy built application
COPY --from=builder /app/apps/bot/dist ./apps/bot/dist
COPY --from=builder /app/packages ./packages

# Copy any additional runtime files
COPY apps/bot/drizzle.config.ts ./apps/bot/
COPY apps/bot/src/db ./apps/bot/src/db

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bot -u 1001

# Change ownership of the app directory
RUN chown -R bot:nodejs /app
USER bot

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "apps/bot/dist/index.js"]