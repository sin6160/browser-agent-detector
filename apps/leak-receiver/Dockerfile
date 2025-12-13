FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:20-slim AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:20-slim AS runner
RUN corepack enable
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# ランタイムに必要なファイルのみコピー
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY package.json pnpm-lock.yaml ./
COPY public ./public

EXPOSE 3000
CMD ["pnpm", "start"]
