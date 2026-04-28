import { toNodeHandler } from "better-auth/node";
import * as cors from "cors";
import "dotenv/config";
import * as express from "express";
import apiRouter from "./routes/api";
import { auth } from "./utils/auth";
import { rmqClient } from "./rabbitmq/client";
import { getStalePendingInferenceIds } from "./db/queries/inference";
import { getStalePendingEvaluationIds } from "./db/queries/evaluation";

const STALE_PENDING_THRESHOLD_SECONDS = 60;

const app = express();
app.set("query parser", "extended");
// Required when behind tunnel proxy: backend must trust Host and X-Forwarded-Proto so cookies and redirects use the public URL
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
      if (origin.endsWith(".trycloudflare.com")) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

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

// Re-publish jobs that were committed to the DB but never reached RabbitMQ
// (e.g. backend crashed between insert and publish). Consumers are idempotent
// (they short-circuit on status != 'pending'), so re-publishing is safe.
// If the DB is older than the current schema and lacks createdAt, we log and
// skip rather than failing startup.
async function sweepStalePending(): Promise<void> {
  try {
    const inferenceIds = await getStalePendingInferenceIds(
      STALE_PENDING_THRESHOLD_SECONDS
    );
    for (const id of inferenceIds) {
      try {
        await rmqClient.sendInference(id);
        console.log(`[sweep] re-queued stale inference ${id}`);
      } catch (err: any) {
        console.error(
          `[sweep] failed to re-queue inference ${id}: ${err?.message ?? err}`
        );
      }
    }

    const evaluationIds = await getStalePendingEvaluationIds(
      STALE_PENDING_THRESHOLD_SECONDS
    );
    for (const id of evaluationIds) {
      try {
        await rmqClient.sendEvaluation(id);
        console.log(`[sweep] re-queued stale evaluation ${id}`);
      } catch (err: any) {
        console.error(
          `[sweep] failed to re-queue evaluation ${id}: ${err?.message ?? err}`
        );
      }
    }

    if (inferenceIds.length === 0 && evaluationIds.length === 0) {
      console.log("[sweep] no stale pending jobs found");
    }
  } catch (err: any) {
    console.warn(
      `[sweep] skipped: ${err?.message ?? err} (jobs may need manual retry)`
    );
  }
}

async function startServer() {
  await rmqClient.connect();
  await sweepStalePending();

  app.listen(PORT, () => {
    console.log("Running on port", PORT);
  });
}

startServer();
