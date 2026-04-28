import * as express from "express";
import { StatusCodes } from "http-status-codes";
import {
  createEvaluation,
  deleteEvaluation,
  getEvaluationObject,
  getInferenceEvaluations,
  markEvaluationFailed,
} from "../db/queries/evaluation";
import {
  getCompletedInferences,
  inferenceExists,
  getInferenceObject,
} from "../db/queries/inference";
import { getMetrics, metricExists } from "../db/queries/metric";
import { projectExists } from "../db/queries/project";
import { getTasks } from "../db/queries/task";
import { NewEvaluation } from "../db/schema";
import { validatedRoute } from "../middleware/zod-validator";
import { rmqClient } from "../rabbitmq/client";
import {
  createEvaluationSchema,
  dataviewSchema,
  deleteEvaluationSchema,
  editHumanScoreSchema,
  getEvaluationOptionsSchema,
  getEvaluationsSchema,
} from "../schemas/evaluation";
import { randomId } from "../utils/misc";
import { S3Connection } from "../storage/duckdb";
import {
  getParsingFunction,
  getParsingFunctions,
  parsingFunctionExists,
} from "../db/queries/parsing";
import Ajv from "ajv/dist/2020";
import { getNotes } from "../db/queries/note";
import {
  deleteHumanScores,
  getEffectiveEvaluationStatus,
  getHumanScoreAggregate,
  getHumanScores,
  upsertHumanScore,
} from "../db/queries/human-score";

const router = express.Router();

async function getEvaluationRowIds(evaluationObjectKey: string) {
  const s3conn = await new S3Connection().connect();

  try {
    await s3conn.createTable(
      "evaluation",
      evaluationObjectKey,
      "evaluation_rows_source"
    );
    const rows = await s3conn.con.runAndReadAll(`
      SELECT unnest(evaluation_rows_source.rows).id AS id
      FROM evaluation_rows_source
    `);

    return new Set(
      rows
        .getRowObjectsJS()
        .map((row) => row.id)
        .filter((id): id is string => typeof id === "string")
    );
  } finally {
    await s3conn.dispose();
  }
}

router.post(
  "/create",
  ...validatedRoute(
    createEvaluationSchema,
    async (req, res) => {
      const validProject = await projectExists(req.body.projectId, req.user.id);
      if (!validProject) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Project doesn't exist" });
      }

      const validInference = await inferenceExists(
        req.body.inferenceId,
        req.user.id
      );
      if (!validInference) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      // TODO: batch the parsing-function and metric existence checks
      for (const parsingFunction of req.body.parsingFunctions) {
        const parsingFunc = await getParsingFunction(parsingFunction.id);
        if (!parsingFunc) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            error: `Parsing function ${parsingFunction.id} doesn't exist`,
          });
        }

        for (const argument of parsingFunction.arguments) {
          const param = parsingFunc.parameters.find((p) => p.id == argument.id);
          if (!param) {
            return res.status(StatusCodes.NOT_FOUND).json({
              success: false,
              error: `Invalid parameter: ${argument.id} doesn't exist`,
            });
          }

          const ajv = new Ajv();
          const validate = ajv.compile(param.schema);
          const valid = validate(argument.value);
          if (!valid) {
            return res.status(StatusCodes.BAD_REQUEST).json({
              success: false,
              error: `Invalid value ${argument.value} for ${argument.id} in ${parsingFunction.id}`,
            });
          }
        }
      }

      // any invalid = fail all
      for (const metricId of req.body.metrics) {
        const validMetric = await metricExists(metricId);
        if (!validMetric) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            error: `Metric ${metricId} doesn't exist`,
          });
        }
      }

      const evaluationId = randomId(6);
      const newEvaluation: NewEvaluation = {
        userId: req.user.id,
        inferenceId: req.body.inferenceId,
        evaluationId,
        projectId: req.body.projectId,
        status: "pending",
        metrics: req.body.metrics,
        parsingFunctions: req.body.parsingFunctions,
        llmJudgeConfig: req.body.llmJudgeConfig,
      };

      await createEvaluation(newEvaluation);
      try {
        await rmqClient.sendEvaluation(evaluationId);
      } catch (err: any) {
        const message = err?.message ?? String(err);
        console.error(
          `failed to publish evaluation ${evaluationId}: ${message}`
        );
        await markEvaluationFailed(evaluationId).catch((dbErr) =>
          console.error(
            `also failed to mark ${evaluationId} as failed:`,
            dbErr
          )
        );
        return res.status(StatusCodes.BAD_GATEWAY).json({
          success: false,
          evaluationId,
          error: `Evaluation was created but could not be queued: ${message}`,
        });
      }

      res.json({ success: true, message: "Created evaluations." });
    },
    "body"
  )
);

router.get(
  "/list",
  ...validatedRoute(
    getEvaluationsSchema,
    async (req, res) => {
      const validProject = await projectExists(
        req.query.projectId,
        req.user.id
      );
      if (!validProject) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Project doesn't exist" });
      }

      const validInference = await inferenceExists(
        req.query.inferenceId,
        req.user.id
      );
      if (!validInference) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      const inferenceEvaluations = await getInferenceEvaluations(
        req.query.inferenceId,
        req.user.id
      );
      const inferenceMeta = await getInferenceObject(
        req.query.inferenceId,
        req.user.id
      );
      const totalExamples =
        inferenceMeta?.totalExamples ?? inferenceMeta?.processedExamples ?? 0;

      const evaluations = await Promise.all(
        inferenceEvaluations.map(async (evaluation) => {
          const effective = await getEffectiveEvaluationStatus({
            evaluationId: evaluation.evaluationId,
            metrics: evaluation.metrics,
            status: evaluation.status as
              | "pending"
              | "processing"
              | "done"
              | "failed"
              | "canceled",
            totalExamples,
          });

          return {
            ...evaluation,
            status: effective.status,
          };
        })
      );

      res.json({ success: true, evaluations });
    },
    "query"
  )
);

// also a caching candidate
router.get(
  "/options",
  ...validatedRoute(
    getEvaluationOptionsSchema,
    async (req, res) => {
      const validProject = await projectExists(
        req.query.projectId,
        req.user.id
      );
      if (!validProject) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Project doesn't exist" });
      }

      const tasks = await getTasks();
      const metrics = await getMetrics();
      const parsingFunctions = await getParsingFunctions(req.user.id);
      const inferences = await getCompletedInferences(req.query.projectId);

      res.json({
        success: true,
        inferences,
        parsingFunctions,
        tasks: tasks.reduce(
          (acc, task) => ({
            ...acc,
            [task.id]: {
              ...task,
              metrics: metrics.filter((metric) => metric.taskId == task.id),
            },
          }),
          {}
        ),
      });
    },
    "query"
  )
);

// TODO: migrate to chunked Parquet (e.g. AWS Athena) for concurrent read scalability.
// FIXME: duckdb is not meant to be used concurrently
router.get(
  "/dataview",
  ...validatedRoute(
    dataviewSchema,
    async (req, res) => {
      const evaluation = await getEvaluationObject(
        req.query.evaluationId,
        req.user.id
      );
      if (!evaluation) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Evaluation doesn't exist" });
      }
      if (
        evaluation.status !== "done" ||
        !evaluation.evaluationObjectKey ||
        !evaluation.inferenceObjectKey
      ) {
        return res.json({
          success: true,
          records: [],
        });
      }

      let s3conn = await new S3Connection().connect();
      s3conn.createTable("dataset", evaluation.datasetObjectKey);
      s3conn.createTable("inference", evaluation.inferenceObjectKey);
      s3conn.createTable("evaluation", evaluation.evaluationObjectKey);

      const result = await s3conn.con.runAndReadAll(`
        SELECT *
        FROM dataset
        JOIN inference ON dataset.id = inference.id
        JOIN (
          SELECT 
            unnest(evaluation.rows).id as id, 
            unnest(evaluation.rows).metrics as metrics,
            unnest(evaluation.rows).parsed as parsed,
            unnest(evaluation.rows).parsedVector as parsedVector,
            unnest(evaluation.rows).referenceVector as referenceVector
          FROM evaluation
        ) as unnested ON dataset.id = unnested.id
      `);

      const aggregateResult = await s3conn.con.runAndReadAll(`
        SELECT aggregate
        FROM evaluation  
      `);

      const aggregateRow = aggregateResult.getRowObjectsJS()[0];
      const aggregate: Record<string, unknown> = aggregateRow?.aggregate
        ? (aggregateRow.aggregate as { key: string; value: any }[]).reduce<
            Record<string, unknown>
          >((acc, { key, value }) => {
            acc[key] = value;
            return acc;
          }, {})
        : {};

      const humanScores = await getHumanScores(req.query.evaluationId);
      const hasHumanEvaluation = Array.isArray(evaluation.metrics)
        ? evaluation.metrics.includes("human_evaluation")
        : false;

      if (hasHumanEvaluation) {
        const humanAggregate = await getHumanScoreAggregate(req.query.evaluationId);
        if (humanAggregate.human_evaluation_mean !== null) {
          aggregate.human_evaluation_mean = humanAggregate.human_evaluation_mean;
        }
        aggregate.human_evaluation_count = humanAggregate.human_evaluation_count;
      }

      const effectiveStatus = await getEffectiveEvaluationStatus({
        evaluationId: req.query.evaluationId,
        metrics: evaluation.metrics,
        status: evaluation.status as
          | "pending"
          | "processing"
          | "done"
          | "failed"
          | "canceled",
        totalExamples: evaluation.totalExamples ?? evaluation.processedExamples ?? 0,
      });

      const notesByRowId = await getNotes(evaluation.inferenceId);
      // DuckDB disambiguates duplicate column names (e.g. id from dataset, inference, unnested) as id, id:1, id:2. Drop the duplicates.
      const records = result.getRowObjectsJson().map((record: Record<string, unknown>) => {
        const out: Record<string, unknown> = { ...record };
        for (const key of Object.keys(out)) {
          if (/^id:\d+$/.test(key)) delete out[key];
        }
        out.input = evaluation.prompt.replaceAll(
          "{{input}}",
          record.input as string
        );
        out.notes = notesByRowId[(record.id as string) ?? ""] ?? "";
        out.humanScore = humanScores[(record.id as string) ?? ""] ?? null;
        return out;
      });

      await s3conn.dispose();

      const meta = {
        model: evaluation.modelName,
        provider: { id: evaluation.providerId, name: evaluation.providerName },
        status: effectiveStatus.status,
        dataset: { id: evaluation.datasetId, name: evaluation.datasetName },
        task: { id: evaluation.taskId, name: evaluation.taskName },
        prompt: evaluation.prompt,
        evaluationMetrics: evaluation.metrics,
        parameters: evaluation.parameters,
        totalExamples: evaluation.totalExamples,
        processedExamples: evaluation.processedExamples,
        humanEvaluationProgress:
          hasHumanEvaluation
            ? {
                ratedRows: effectiveStatus.ratedRows,
                totalRows: effectiveStatus.totalRows,
              }
            : null,
      };

      return res.json({ success: true, records, aggregate, meta });
    },
    "query"
  )
);

router.post(
  "/edit-human-score",
  ...validatedRoute(
    editHumanScoreSchema,
    async (req, res) => {
      const evaluation = await getEvaluationObject(
        req.body.evaluationId,
        req.user.id
      );

      if (!evaluation) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Evaluation doesn't exist" });
      }

      const evaluationMetrics = Array.isArray(evaluation.metrics)
        ? evaluation.metrics
        : [];
      if (!evaluationMetrics.includes("human_evaluation")) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "This evaluation does not support human scoring",
        });
      }

      if (evaluation.status !== "done") {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "Human scoring is only available after evaluation completes",
        });
      }

      if (!evaluation.evaluationObjectKey) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: "Evaluation rows are not available for scoring",
        });
      }

      const validRowIds = await getEvaluationRowIds(evaluation.evaluationObjectKey);
      const invalidRow = req.body.scores.find(
        (score) => !validRowIds.has(score.rowId)
      );
      if (invalidRow) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: `Invalid evaluation row: ${invalidRow.rowId}`,
        });
      }

      for (const score of req.body.scores) {
        if (score.score === null) {
          await deleteHumanScores(req.body.evaluationId, [score.rowId]);
        } else {
          await upsertHumanScore(req.body.evaluationId, score.rowId, score.score);
        }
      }

      return res.json({ success: true });
    },
    "body"
  )
);

router.delete(
  "/delete",
  ...validatedRoute(
    deleteEvaluationSchema,
    async (req, res) => {
      const evaluation = await getEvaluationObject(
        req.body.evaluationId,
        req.user.id
      );
      
      if (!evaluation) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Evaluation doesn't exist" });
      }

      // Delete from database
      await deleteEvaluation(req.body.evaluationId, req.user.id);

      // Delete MinIO object if it exists
      if (evaluation.evaluationObjectKey) {
        try {
          const { minioClient } = await import("../storage/minio");
          await minioClient.removeObject("evaluation", evaluation.evaluationObjectKey);
        } catch (error) {
          console.error("Failed to delete evaluation object from MinIO:", error);
          // Don't fail the whole operation if MinIO cleanup fails
        }
      }

      res.json({ 
        success: true, 
        message: "Evaluation deleted successfully" 
      });
    },
    "body"
  )
);

export default router;
