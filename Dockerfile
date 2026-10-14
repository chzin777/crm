# syntax=docker/dockerfile:1

# Stage 1: dependências completas (cacheadas enquanto os manifests não mudam)
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Stage 2: build (prisma generate + next build em modo standalone)
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# O prisma.config.ts exige as variáveis DB_*; aqui são apenas placeholders de build (nenhuma conexão é aberta).
RUN DB_HOST=build DB_PORT=5432 DB_NAME=build DB_USER=build DB_PASSWORD=build \
    BETTER_AUTH_SECRET=build-time-placeholder-secret-32-chars-min \
    npm run build

# Stage 3: runtime mínimo, sem devDependencies nem código-fonte
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1
CMD ["node", "server.js"]
