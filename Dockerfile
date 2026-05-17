# =====================================================
# MEDISPACE Backend — Dockerfile (Multi-Stage)
# Stage 1 · deps    : cache node_modules dev
# Stage 2 · builder : compile TypeScript → dist/
# Stage 3 · runtime : chỉ prod deps + dist
# =====================================================

# ── Stage 1: Dependencies (cache layer riêng) ────────────────────────────────
FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install && npm cache clean --force


# ── Stage 2: Builder ──────────────────────────────────────────────────────────
FROM node:26-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build


# ── Stage 3: Runtime (chỉ prod deps + compiled output) ───────────────────────
FROM node:26-alpine AS runtime
ENV NODE_ENV=production

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 8000

CMD ["node", "dist/index.js"]
