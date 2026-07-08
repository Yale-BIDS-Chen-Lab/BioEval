// Dependency-free static file server for the built SPA (production).
// Serves ./dist and falls back to index.html for client-side routes.
// Kept zero-dep on purpose (same spirit as docker-files/tunnel-proxy.js) so the
// production image needs no extra packages.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const DIST = path.resolve(__dirname, "dist");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(filePath, res) {
  // Never serve anything resolved outside DIST.
  if (!path.resolve(filePath).startsWith(DIST)) {
    return send(res, 403, "Forbidden");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not Found");
    const ext = path.extname(filePath).toLowerCase();
    send(res, 200, data, {
      "Content-Type": MIME[ext] || "application/octet-stream",
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed");
  }

  if (req.url === "/health") {
    return send(res, 200, JSON.stringify({ status: "ok" }), {
      "Content-Type": "application/json",
    });
  }

  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const filePath = path.join(DIST, path.normalize(urlPath).replace(/^(\.\.[/\\])+/, ""));

  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) return serveFile(filePath, res);
    // SPA fallback: unknown paths render the client-side app.
    serveFile(path.join(DIST, "index.html"), res);
  });
});

server.listen(PORT, () => {
  console.log(`static server serving ${DIST} on :${PORT}`);
});
