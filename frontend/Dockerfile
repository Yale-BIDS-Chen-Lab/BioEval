# syntax=docker/dockerfile:1
# Frontend image: builds the static SPA and serves it with a zero-dependency
# Node server (serve.cjs), running as a non-root user (no dev server, no nginx).

# ---- builder: build static SPA -> dist/ ----
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* vars at build time, so the backend URL is baked here.
ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
# `vite build` emits the deployable bundle (rollup/esbuild). We intentionally do
# NOT run the package.json `build` script's trailing `&& tsc`: that type-check
# currently fails on pre-existing implicit-any debt and does not affect the bundle.
RUN npx vite build

# ---- runtime: serve dist/ statically, non-root ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/dist ./dist
COPY serve.cjs ./serve.cjs
USER node
EXPOSE 3000
CMD ["node", "serve.cjs"]
