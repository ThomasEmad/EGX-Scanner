# EGX Scanner — production image (Next.js 16 standalone + Prisma/SQLite).
# Build:  docker build -t egx-scanner .
# Run:    see docker-compose.yml (mounts db/, storage/, reports/ + .env)

# ---------- 1. Dependencies ----------
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. Build ----------
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL is only needed at runtime; a placeholder keeps prisma generate
# happy without baking any real database into the image.
ENV DATABASE_URL="file:/app/db/custom.db" \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=4096"
RUN npx prisma generate \
 && npx next build --webpack

# ---------- 3. Runtime ----------
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl wget
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    EGX_ROOT=/app \
    NEXT_TELEMETRY_DISABLED=1

# Non-root user; owns the writable state dirs (db, storage, reports)
RUN addgroup -S egx && adduser -S egx -G egx \
 && mkdir -p /app/db /app/storage /app/reports \
 && chown -R egx:egx /app/db /app/storage /app/reports

# Standalone server + static assets + public
COPY --from=builder --chown=egx:egx /app/.next/standalone ./
COPY --from=builder --chown=egx:egx /app/.next/static ./.next/static
COPY --from=builder --chown=egx:egx /app/public ./public

# Prisma schema + migrations + CLI so the entrypoint can `migrate deploy`
# against the mounted volume on first boot.
COPY --from=builder --chown=egx:egx /app/prisma ./prisma
COPY --from=builder --chown=egx:egx /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=egx:egx /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=egx:egx /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --chown=egx:egx docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh && chmod +x ./node_modules/.bin/prisma

USER egx
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null 2>&1 || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
