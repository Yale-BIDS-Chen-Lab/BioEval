import * as express from "express";
import { authMiddleware } from "../middleware/auth";
import inferenceRouter from "./inference";
import projectRouter from "./project";
import evaluationRouter from "./evaluation";
import datasetRouter from "./dataset";
import integrationRouter from "./integration";
import parsingRouter from "./parsing";
import type { AuthedRequest } from "../types/auth";

const router = express.Router();

router.use(authMiddleware);

// Log activity for all authenticated API requests (see "other people" usage on public domain)
router.use((req: AuthedRequest<{}>, _res, next) => {
  const user = req.user?.email ?? req.user?.id ?? "unknown";
  const origin = req.get("origin") ?? req.get("referer") ?? "-";
  console.log(`[activity] ${req.method} ${req.originalUrl} | user: ${user} | origin: ${origin}`);
  next();
});

router.use("/project", projectRouter);
router.use("/inference", inferenceRouter);
router.use("/evaluation", evaluationRouter);
router.use("/dataset", datasetRouter);
router.use("/integration", integrationRouter);
router.use("/parsing", parsingRouter);

export default router;
