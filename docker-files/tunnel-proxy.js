/**
 * Single-origin proxy for Cloudflare Tunnel (no extra deps).
 * Run: node tunnel-proxy.js
 * Then: cloudflared tunnel --url http://localhost:3010
 *
 * Proxies /api -> http://localhost:3001, everything else -> http://localhost:3000
 * So the frontend and API share one origin and cookies work.
 */
const http = require("http");
const url = require("url");

const FRONTEND_PORT = 3000;
const BACKEND_PORT = 3001;
const PROXY_PORT = 3010;

function proxyRequest(clientReq, clientRes, targetPort) {
  const isBackend = targetPort === BACKEND_PORT;
  const headers = { ...clientReq.headers };
  if (isBackend) {
    // Keep original Host so backend sets/clears cookies for the tunnel domain (sign-in/sign-out work on public URL)
    headers["x-forwarded-proto"] = "https";
    // only override Host for backend when we have a real host from the client (tunnel)
    if (clientReq.headers.host && !clientReq.headers.host.includes("localhost")) {
      headers.host = clientReq.headers.host;
    } else {
      headers.host = `localhost:${targetPort}`;
    }
  } else {
    headers.host = `localhost:${targetPort}`;
  }
  const opts = {
    hostname: "localhost",
    port: targetPort,
    path: clientReq.url,
    method: clientReq.method,
    headers,
  };
  const proxy = http.request(opts, (upstreamRes) => {
    clientRes.writeHead(upstreamRes.statusCode, upstreamRes.headers);
    upstreamRes.pipe(clientRes);
  });
  proxy.on("error", (err) => {
    console.error("Proxy error:", err.message);
    clientRes.writeHead(502, { "Content-Type": "text/plain" });
    clientRes.end("Bad Gateway");
  });
  clientReq.pipe(proxy);
}

const server = http.createServer((req, res) => {
  const target = req.url.startsWith("/api") ? BACKEND_PORT : FRONTEND_PORT;
  proxyRequest(req, res, target);
});

server.listen(PROXY_PORT, () => {
  console.log(`Tunnel proxy: http://localhost:${PROXY_PORT}`);
  console.log(`  /api/* -> localhost:${BACKEND_PORT}`);
  console.log(`  /*    -> localhost:${FRONTEND_PORT}`);
  console.log(`Run: cloudflared tunnel --url http://localhost:${PROXY_PORT}`);
});
