# Deployment

BioEval ships a single stack (`docker-files/docker-compose.yml`), built for
production. This document covers what it does and how migrations work.

## What the stack does

- **backend** and **frontend** run **built artifacts** as a **non-root** user
  (`backend/Dockerfile`, `frontend/Dockerfile`) — no dev server. The frontend is
  served by a zero-dependency static server (`frontend/serve.cjs`).
- **`NODE_ENV=production`** — the backend refuses to boot if `BETTER_AUTH_SECRET`
  is missing, too short, or the committed dev default
  (`backend/src/utils/config.ts`).
- **Versioned migrations** — schema is applied with `drizzle-kit migrate`
  (against `backend/supabase/migrations/`), not `drizzle-kit push --force`.
- **`restart: unless-stopped` + healthchecks** on every long-running service
  (`GET /health` for backend/frontend, TCP for inference).

Not mapped to the public internet: reach it locally / over LAN via the exposed
ports, or over an SSH port-forward
(`ssh -L 3000:localhost:3000 -L 3001:localhost:3001 user@host`). Put your own
reverse proxy in front if you need TLS.

## Deploy

```bash
cd docker-files
cp .env.example .env
# Set a real BETTER_AUTH_SECRET (and, for shared/remote installs, real DB /
# RabbitMQ / MinIO passwords):
#   openssl rand -base64 32   # BETTER_AUTH_SECRET
#   openssl rand -base64 24   # passwords
docker compose up --build -d
```

For NVIDIA GPU inference add the GPU overlay; for Apple MPS use the host-native
script — see the README's Setup section.

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
a database, baseline-adopt: create the `drizzle.__drizzle_migrations` bookkeeping
table and record the baseline as already applied *without* running its SQL, so
only future migrations execute. Do this deliberately, with a backup first.

New installs do not need this — they start clean.

## Follow-ups (not yet done)

- MinIO buckets are created with a public-read policy (`mc policy set public`) and
  `minio`/`mc` images are unpinned (`:latest`). For hardened production, pin image
  versions and review whether buckets should be public.
- The frontend `npm run build` script's trailing `&& tsc` currently fails on
  pre-existing implicit-`any` type errors; the image builds with `vite build`
  directly. Cleaning up those types would restore the type-check gate.
