# BioEval – Deployment Guide (Cloudflare Tunnel)

This guide shows how to make your local BioEval instance publicly accessible using **Cloudflare Tunnel** – no domain required, just a quick public URL.

---

## Prerequisites

1. **Docker and Docker Compose** installed
2. **Cloudflare Tunnel** installed:
   ```bash
   # Linux
   wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared-linux-amd64.deb
   ```

3. **Node.js** (for the tunnel proxy)

---

## Step 1: Start the App

Start all services (backend, frontend, database, RabbitMQ, MinIO, inference):

```bash
cd docker-files
docker compose up -d
```

Verify all services are running:
```bash
docker compose ps
```

---

## Step 2: Start the Tunnel Proxy

For sign-in to work, the frontend and API must use the **same origin** (so cookies work). The tunnel proxy ensures one tunnel URL serves both.

In a **new terminal**:

```bash
cd docker-files
node tunnel-proxy.js
```

This proxy listens on **port 3010** and forwards:
- `/api/*` → backend (port 3001)
- Everything else → frontend (port 3000)

Leave this running.

---

## Step 3: Start the Cloudflare Tunnel

In **another terminal**:

```bash
cloudflared tunnel --url http://localhost:3010
```

You'll see output like:
```
Your quick tunnel is: https://something-random.trycloudflare.com
```

**Copy this URL** – this is your public URL.

---

## Step 4: Open the Public URL

Open the tunnel URL (e.g. `https://something-random.trycloudflare.com`) in any browser, anywhere.

- Sign-in, sign-up, and all API calls work because they share the same origin
- Anyone with the URL can access your app

**Note:** Each time you restart `cloudflared tunnel` without authentication, you get a **new random URL**. No need to reconfigure the backend—it already trusts all `*.trycloudflare.com` URLs.

---

## Summary

1. Start the app: `docker compose up -d`
2. Start the proxy: `node tunnel-proxy.js` (in a new terminal)
3. Start the tunnel: `cloudflared tunnel --url http://localhost:3010` (in another terminal)
4. Open the tunnel URL in your browser

**That's it!** Anyone with the URL can use your app. When you stop the tunnel, it's no longer accessible.
