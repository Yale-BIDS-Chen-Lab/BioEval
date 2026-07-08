# Production Deployment

The dev stack (`docker-files/docker-compose.yml`) runs hot-reloading dev servers
with committed default secrets — fine for local use, not for an internet-facing
deploy. This document describes the production stack.

## What the production stack changes

`docker-files/docker-compose.prod.yml` (self-contained; do **not** combine it
with `docker-compose.yml`):

- **backend** and **frontend** run **built artifacts** as a **non-root** user
  (`backend/Dockerfile.prod`, `frontend/Dockerfile.prod`) — no `nodemon`/`vite`
  dev server. The frontend is served by a zero-dependency static server
  (`frontend/serve.cjs`).
- **`NODE_ENV=production`** — the backend refuses to boot if `BETTER_AUTH_SECRET`
  is missing, too short, or still the committed dev default
  (`backend/src/utils/config.ts`).
- **Versioned migrations** — schema is applied with `drizzle-kit migrate`
  (against `backend/supabase/migrations/`), not `drizzle-kit push --force`.
- **`restart: unless-stopped` + healthchecks** on every long-running service
  (`GET /health` for backend/frontend, TCP for inference).
- **No source bind mounts / hot reload.**

This stack is **not** mapped to the public internet. Access it internally —
`localhost`/LAN via the exposed ports, or over an SSH port-forward
(`ssh -L 3000:localhost:3000 -L 3001:localhost:3001 user@host`). Put your own
reverse proxy in front if you need TLS.

## Deploy (fresh install)

```bash
cd docker-files
cp .env.production.example .env
# Fill in EVERY value. Generate secrets, e.g.:
#   openssl rand -base64 32   # BETTER_AUTH_SECRET
#   openssl rand -base64 24   # DB / RabbitMQ / MinIO passwords
docker compose -f docker-compose.prod.yml up --build -d
```

## Migrations

The baseline migration (`0000_baseline_schema.sql`) is generated from
`backend/src/db/schema.ts` and covers all tables. Regenerate after any schema
change:

```bash
cd backend
npx drizzle-kit generate --name <change_description>
```

Commit the generated SQL. On the next deploy, the `migrate` service applies any
new migrations.

### Adopting migrations on a database created with `push`

`drizzle-kit migrate` on a **fresh** database is safe. A database previously
provisioned with `drizzle-kit push --force` already has the tables, so applying
the baseline migration would fail (`CREATE TABLE ... already exists`). For such
a database, either:

- Keep using the dev flow / `push` for that specific database, **or**
- Baseline-adopt: create the `drizzle.__drizzle_migrations` bookkeeping table and
  record the baseline as already applied *without* running its SQL, so only
  future migrations execute. Do this deliberately, with a backup first.

New production installs do not need this — they start clean.

## Follow-ups (not yet done)

- MinIO buckets are created with a public-read policy (`mc policy set public`) and
  `minio`/`mc` images are unpinned (`:latest`). For hardened production, pin image
  versions and review whether buckets should be public.
- The frontend `npm run build` script's trailing `&& tsc` currently fails on
  pre-existing implicit-`any` type errors; the production image builds with
  `vite build` directly. Cleaning up those types would restore the type-check gate.
