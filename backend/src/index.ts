import { toNodeHandler } from "better-auth/node";
import * as cors from "cors";
import "dotenv/config";
import * as express from "express";
import apiRouter from "./routes/api";
import { auth } from "./utils/auth";
import { rmqClient } from "./rabbitmq/client";
import { validateProductionConfig } from "./utils/config";

// Fail fast on unsafe production config (e.g. the dev-default auth secret).
// No-op unless NODE_ENV=production, so local/dev is unaffected.
validateProductionConfig();

const app = express();
app.set("query parser", "extended");
// Trust the first proxy hop (Host / X-Forwarded-Proto) when running behind a
// reverse proxy, so cookies and redirects use the external URL.
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.ADDITIONAL_ORIGINS?.split(",").map((o) => o.trim()) ?? []),
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Unauthenticated liveness probe (used by container healthchecks).
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Log auth activity (sign-in/sign-up attempts from public domain)
app.use("/api/auth", (req, _res, next) => {
  const origin = req.get("origin") ?? req.get("referer") ?? "-";
  console.log(`[activity] ${req.method} ${req.originalUrl} | origin: ${origin} (auth)`);
  next();
});
app.all("/api/auth/{*splat}", toNodeHandler(auth));
// must be after auth handler
app.use(express.json());

app.use("/api", apiRouter);

async function startServer() {
  await rmqClient.connect();

  app.listen(PORT, () => {
    console.log("Running on port", PORT);
  });
}

startServer();
