# syntax=docker/dockerfile:1

# ---------- deps: install once, reused by build stages ----------
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# ---------- builder: produce the standalone Next.js server ----------
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL only needs to be syntactically valid at build time —
# `next build` does not connect to it, but prisma generate reads the schema.
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV SESSION_SECRET="build_time_placeholder_not_used_at_runtime_______"
RUN npx prisma generate
RUN npm run build

# ---------- runner: minimal production app image ----------
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]

# ---------- worker: background job processor ----------
# Runs TypeScript directly via tsx rather than a bundled build — shares the
# exact same domain services as the app image, just a different entrypoint.
FROM node:22-alpine AS worker
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
USER node
CMD ["npx", "tsx", "src/worker/index.ts"]
