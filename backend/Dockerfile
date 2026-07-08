# syntax=docker/dockerfile:1
# Backend image: compiles TypeScript to dist/ and runs the built JS as a
# non-root user (no dev server).

# ---- builder: all deps + compile TS -> dist/ ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- migrate: apply versioned migrations + seed (needs dev deps: drizzle-kit, ts-node) ----
# Used by the `migrate` service in docker-compose.yml. Fresh deploys only —
# see docs/PRODUCTION.md for adopting migrations on a DB previously built with `push`.
FROM builder AS migrate
CMD ["sh", "-c", "npx drizzle-kit migrate && npx ts-node scripts/seed.ts"]

# ---- runtime: prod deps only, non-root ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
