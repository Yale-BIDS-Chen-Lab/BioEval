import Ajv2020 from "ajv/dist/2020";
import * as express from "express";
import { StatusCodes } from "http-status-codes";
import {
  datasetExists,
  getDatasetObject,
  getDatasets,
} from "../db/queries/dataset";
import {
  cancelInference,
  copyInference,
  createInference,
  deleteInference,
  getInferenceObject,
  getProjectInferences,
  inferenceExists,
  toggleFavoriteInference,
} from "../db/queries/inference";
import { deleteEvaluationsByInference, getInferenceEvaluations, getEvaluationObject } from "../db/queries/evaluation";
import { getModel } from "../db/queries/model";
import { projectExists } from "../db/queries/project";
import { getProviders, providerExists } from "../db/queries/provider";
import { getTasks } from "../db/queries/task";
import { NewInference } from "../db/schema";
import { validatedRoute } from "../middleware/zod-validator";
import { rmqClient } from "../rabbitmq/client";
import {
  compareSchema,
  createInferenceSchema,
  dataviewSchema,
  editHighlightSchema,
  editNoteSchema,
  getInferencesSchema,
} from "../schemas/inference";
import { S3Connection } from "../storage/duckdb";
import { AuthedRequest } from "../types/auth";
import { randomId } from "../utils/misc";
import { getUserConfig } from "../db/queries/integration";
import { getNotes, upsertNote } from "../db/queries/note";
import { z } from "zod/v4";
import {
  deleteHighlights,
  deleteHighlightsByInference,
  getHighlights,
  upsertHighlight,
} from "../db/queries/highlight";
import { deleteNotesByInference } from "../db/queries/note";

const router = express.Router();

type AggregateMetrics = Record<string, number>;
type InferenceEvaluationRow = Awaited<
  ReturnType<typeof getInferenceEvaluations>
>[number];
type LatestCompletedEvaluationSummary = {
  evaluationId: string;
  createdAt: string | null;
  metrics: string[];
  aggregate: AggregateMetrics;
} | null;

type DatasetPlacementSummary = {
  tier: "gold" | "silver" | "bronze";
  metricKey: string;
  value: number;
} | null;

function getAzureReasoningEffortOptions(modelName: string) {
  if (modelName === "gpt-5") {
    return ["minimal", "low", "medium", "high"];
  }

  if (["o1", "o3", "o3-mini", "o4-mini"].includes(modelName)) {
    return ["low", "medium", "high"];
  }

  return ["none", "low", "medium", "high", "xhigh"];
}

function sortEvaluationsByCreatedAtDesc(
  evaluations: InferenceEvaluationRow[]
): InferenceEvaluationRow[] {
  return [...evaluations].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
}

function normalizeAggregateMetrics(aggregate: unknown): AggregateMetrics {
  if (!aggregate) {
    return {};
  }

  if (Array.isArray(aggregate)) {
    return aggregate.reduce<AggregateMetrics>((acc, item) => {
      if (
        item &&
        typeof item === "object" &&
        "key" in item &&
        "value" in item &&
        typeof item.key === "string"
      ) {
        const numericValue =
          typeof item.value === "number" ? item.value : Number(item.value);
        if (Number.isFinite(numericValue)) {
          acc[item.key] = numericValue;
        }
      }
      return acc;
    }, {});
  }

  if (typeof aggregate === "object") {
    return Object.entries(aggregate as Record<string, unknown>).reduce<
      AggregateMetrics
    >((acc, [key, value]) => {
      const numericValue =
        typeof value === "number" ? value : Number(value);
      if (Number.isFinite(numericValue)) {
        acc[key] = numericValue;
      }
      return acc;
    }, {});
  }

  return {};
}

function normalizeMetricList(metrics: unknown): string[] {
  if (!Array.isArray(metrics)) {
    return [];
  }

  return metrics.filter((metric): metric is string => typeof metric === "string");
}

function getPrimaryMetricKey(taskName: string) {
  switch (taskName) {
    case "Named-entity Recognition":
      return "exact_match_f1";
    case "Multiple Choice Questions":
      return "accuracy";
    case "Multi-label Classification":
      return "macro_f1";
    case "Single-label Classification":
      return "macro_f1";
    case "Generation":
      return "rougel";
    default:
      return null;
  }
}

function getAggregateMetricValue(
  aggregate: AggregateMetrics,
  metricKey: string
): number | null {
  const directValue = aggregate[metricKey];
  if (typeof directValue === "number" && Number.isFinite(directValue)) {
    return directValue;
  }

  const matchedEntry = Object.entries(aggregate).find(
    ([key]) => key.toLowerCase() === metricKey.toLowerCase()
  );
  if (!matchedEntry) {
    return null;
  }

  const [, value] = matchedEntry;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function readEvaluationAggregate(
  evaluationObjectKey: string
): Promise<AggregateMetrics> {
  const s3conn = await new S3Connection().connect();

  try {
    await s3conn.createTable(
      "evaluation",
      evaluationObjectKey,
      "evaluation_summary"
    );
    const aggregateResult = await s3conn.con.runAndReadAll(`
      SELECT aggregate
      FROM evaluation_summary
      LIMIT 1
    `);
    const aggregateRow = aggregateResult.getRowObjectsJS()[0];
    return normalizeAggregateMetrics(aggregateRow?.aggregate);
  } finally {
    await s3conn.dispose();
  }
}

async function buildInferenceEvaluationSummary(
  evaluations: InferenceEvaluationRow[],
  taskName: string
) {
  const orderedEvaluations = sortEvaluationsByCreatedAtDesc(evaluations);
  const latestCompleted = orderedEvaluations.find(
    (evaluation) => evaluation.status === "done" && evaluation.objectKey
  );

  let latestCompletedSummary: LatestCompletedEvaluationSummary = null;
  const primaryMetricKey = getPrimaryMetricKey(taskName);
  let primaryMetricBest:
    | {
        metricKey: string;
        value: number;
      }
    | null = null;

  const completedEvaluations = orderedEvaluations.filter(
    (evaluation) => evaluation.status === "done" && evaluation.objectKey
  );

  for (const evaluation of completedEvaluations) {
    let aggregate: AggregateMetrics = {};
    try {
      aggregate = await readEvaluationAggregate(evaluation.objectKey!);
    } catch (error) {
      console.error(
        `Failed to read aggregate for evaluation ${evaluation.evaluationId}:`,
        error
      );
    }

    if (evaluation.evaluationId === latestCompleted?.evaluationId) {
      latestCompletedSummary = {
        evaluationId: evaluation.evaluationId,
        createdAt: evaluation.createdAt ?? null,
        metrics: normalizeMetricList(evaluation.metrics),
        aggregate,
      };
    }

    if (!primaryMetricKey) {
      continue;
    }

    const metricValue = getAggregateMetricValue(aggregate, primaryMetricKey);
    if (metricValue === null) {
      continue;
    }

    if (!primaryMetricBest || metricValue > primaryMetricBest.value) {
      primaryMetricBest = {
        metricKey: primaryMetricKey,
        value: metricValue,
      };
    }
  }

  return {
    count: evaluations.length,
    hasRunningEvaluations: evaluations.some(
      (evaluation) =>
        evaluation.status === "pending" || evaluation.status === "processing"
    ),
    latestCompleted: latestCompletedSummary,
    primaryMetricBest,
  };
}

router.post(
  "/create",
  ...validatedRoute(
    createInferenceSchema,
    async (req, res) => {
      const validProject = await projectExists(req.body.projectId, req.user.id);
      if (!validProject) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Project doesn't exist" });
      }

      const validDataset = await datasetExists(req.body.datasetId, req.user.id);
      if (!validDataset) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Dataset doesn't exist" });
      }

      for (const modelQuery of req.body.models) {
        const validProvider = await providerExists(modelQuery.provider);
        if (!validProvider) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            error: `Provider ${modelQuery.provider} doesn't exist`,
          });
        }

        const model = await getModel(modelQuery.model);
        if (!model) {
          return res.status(StatusCodes.NOT_FOUND).json({
            success: false,
            error: `Model ${modelQuery.model} doesn't exist`,
          });
        }

        const config = await getUserConfig(modelQuery.provider, req.user.id);
        if (!config) {
          return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
            success: false,
            error: `Please setup integration for provider ${modelQuery.provider}!`,
          });
        }

        for (const argument of modelQuery.parameters) {
          if (
            modelQuery.provider === "azure" &&
            argument.id === "reasoning_effort"
          ) {
            const allowedValues = getAzureReasoningEffortOptions(
              modelQuery.model
            );
            if (
              typeof argument.value !== "string" ||
              !allowedValues.includes(argument.value)
            ) {
              return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                error: `Invalid value ${argument.value} for ${argument.id} in ${modelQuery.model}`,
              });
            }
            continue;
          }

          const param = model.parameters.find((p) => p.id == argument.id);
          if (!param) {
            return res.status(StatusCodes.NOT_FOUND).json({
              success: false,
              error: `Invalid parameter: ${argument.id} doesn't exist`,
            });
          }

          const ajv = new Ajv2020();
          const validate = ajv.compile(param.schema);
          const valid = validate(argument.value);
          if (!valid) {
            return res.status(StatusCodes.BAD_REQUEST).json({
              success: false,
              error: `Invalid value ${argument.value} for ${argument.id} in ${modelQuery.model}`,
            });
          }
        }

        const dataset = await getDatasetObject(req.body.datasetId, req.user.id);
        const inferenceId = randomId(6);
        const newInference: NewInference = {
          userId: req.user.id,
          projectId: req.body.projectId,
          taskId: dataset.taskId,
          datasetId: req.body.datasetId,
          inferenceId,
          prompt: req.body.prompt,
          model: modelQuery.model,
          status: "pending",
          parameters: modelQuery.parameters,
          providerId: modelQuery.provider,
        };

        await createInference(newInference);
        rmqClient.sendInference(inferenceId);
      }

      res.json({ success: true, message: "Created inference." });
    },
    "body"
  )
);

router.get(
  "/list",
  ...validatedRoute(
    getInferencesSchema,
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

      const projectInferences = await getProjectInferences(req.query.projectId);
      const inferencesWithSummary = await Promise.all(
        projectInferences.map(async (projectInference) => {
          const evaluations = await getInferenceEvaluations(
            projectInference.inferenceId,
            req.user.id
          );

          return {
            ...projectInference,
            evaluationSummary: await buildInferenceEvaluationSummary(
              evaluations,
              projectInference.task ?? ""
            ),
          };
        })
      );

      const placementsByInference = new Map<
        string,
        NonNullable<DatasetPlacementSummary>
      >();

      const inferencesByDataset = new Map<
        string,
        Array<{
          inferenceId: string;
          metricKey: string;
          value: number;
        }>
      >();

      for (const inference of inferencesWithSummary) {
        const primaryMetricBest = inference.evaluationSummary?.primaryMetricBest;
        if (!primaryMetricBest) {
          continue;
        }

        const group = inferencesByDataset.get(inference.datasetId) ?? [];
        group.push({
          inferenceId: inference.inferenceId,
          metricKey: primaryMetricBest.metricKey,
          value: primaryMetricBest.value,
        });
        inferencesByDataset.set(inference.datasetId, group);
      }

      for (const rankedInferences of inferencesByDataset.values()) {
        rankedInferences.sort((a, b) => {
          if (b.value !== a.value) {
            return b.value - a.value;
          }
          return a.inferenceId.localeCompare(b.inferenceId);
        });

        const tiers: Array<NonNullable<DatasetPlacementSummary>["tier"]> = [
          "gold",
          "silver",
          "bronze",
        ];

        rankedInferences.slice(0, 3).forEach((inference, index) => {
          placementsByInference.set(inference.inferenceId, {
            tier: tiers[index],
            metricKey: inference.metricKey,
            value: inference.value,
          });
        });
      }

      const inferences = inferencesWithSummary.map((inference) => ({
        ...inference,
        datasetPlacement:
          placementsByInference.get(inference.inferenceId) ??
          (null as DatasetPlacementSummary),
      }));

      res.json({ success: true, inferences });
    },
    "query"
  )
);

const getInferenceEvaluationSummarySchema = z.object({
  projectId: z.string().nonempty(),
  inferenceId: z.string().nonempty(),
});

router.get(
  "/evaluation-summary",
  ...validatedRoute(
    getInferenceEvaluationSummarySchema,
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

      const evaluations = sortEvaluationsByCreatedAtDesc(
        await getInferenceEvaluations(req.query.inferenceId, req.user.id)
      );

      const detailedEvaluations = await Promise.all(
        evaluations.map(async (evaluation) => {
          let aggregate: AggregateMetrics | null = null;
          if (evaluation.status === "done" && evaluation.objectKey) {
            try {
              aggregate = await readEvaluationAggregate(evaluation.objectKey);
            } catch (error) {
              console.error(
                `Failed to read aggregate for evaluation ${evaluation.evaluationId}:`,
                error
              );
              aggregate = {};
            }
          }

          return {
            evaluationId: evaluation.evaluationId,
            status: evaluation.status,
            metrics: normalizeMetricList(evaluation.metrics),
            createdAt: evaluation.createdAt ?? null,
            aggregate,
          };
        })
      );

      res.json({
        success: true,
        summary: {
          count: detailedEvaluations.length,
          hasRunningEvaluations: detailedEvaluations.some(
            (evaluation) =>
              evaluation.status === "pending" ||
              evaluation.status === "processing"
          ),
          evaluations: detailedEvaluations,
        },
      });
    },
    "query"
  )
);

// candidate for caching
const AZURE_REASONING_MODEL_IDS = [
  "o1",
  "o3",
  "o3-mini",
  "o4-mini",
  "gpt-5",
  "gpt-5.4",
];

router.get("/options", async (req: AuthedRequest<{}>, res) => {
  const tasks = await getTasks();
  const datasets = await getDatasets(req.user.id);
  const providersRaw = await getProviders();
  const providers = providersRaw.map((p) =>
    p.providerId === "azure"
      ? { ...p, reasoningModelIds: AZURE_REASONING_MODEL_IDS }
      : p
  );

  res.json({
    success: true,
    providers,
    tasks: tasks.reduce(
      (acc, task) => ({
        ...acc,
        [task.id]: {
          ...task,
          datasets: datasets.filter((dataset) => dataset.taskId == task.id),
        },
      }),
      {}
    ),
  });
});

// TODO: migrate to chunked Parquet (e.g. AWS Athena) for concurrent read scalability.
// FIXME: duckdb is not meant to be used concurrently
router.get(
  "/dataview",
  ...validatedRoute(
    dataviewSchema,
    async (req, res) => {
      const inference = await getInferenceObject(
        req.query.inferenceId,
        req.user.id
      );
      if (!inference) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }
      // Allow viewing "done" and "canceled" inferences (with partial results)
      if ((inference.status !== "done" && inference.status !== "canceled") || !inference.inferenceObjectKey) {
        // handle later
        return res.json({
          success: true,
          records: [],
        });
      }

      let s3conn = await new S3Connection().connect();
      s3conn.createTable("dataset", inference.datasetObjectKey);
      s3conn.createTable("inference", inference.inferenceObjectKey);

      const result = await s3conn.con.runAndReadAll(`
        SELECT *
        FROM dataset
        JOIN inference
        ON dataset.id = inference.id;
      `);

      const notesByRowId = await getNotes(req.query.inferenceId);
      // FIXME: prompt template expansion is duplicated in the inference service; keep in sync.
      const records = result.getRowObjectsJson().map((record) => {
        return {
          ...record,
          input: inference.prompt.replaceAll(
            "{{input}}",
            record.input as string
          ),
          notes: notesByRowId[record.id as string] ?? "",
        };
      });

      await s3conn.dispose();

      const meta = {
        model: inference.model,
        provider: { id: inference.providerId, name: inference.providerName },
        status: inference.status,
        dataset: { id: inference.datasetId, name: inference.datasetName },
        task: { id: inference.taskId, name: inference.taskName },
        prompt: inference.prompt,
        parameters: inference.parameters,
        totalExamples: inference.totalExamples,
        processedExamples: inference.processedExamples,
      };

      res.json({
        success: true,
        records,
        meta,
      });
    },
    "query"
  )
);

router.get(
  "/meta",
  ...validatedRoute(
    z.object({
      inferenceId: z.string().nonempty(),
    }),
    async (req, res) => {
      const inf = await getInferenceObject(req.query.inferenceId, req.user.id);
      if (!inf) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      const meta = {
        model: inf.model,
        provider: { id: inf.providerId, name: inf.providerName },
        status: inf.status,
        dataset: { id: inf.datasetId, name: inf.datasetName },
        task: { id: inf.taskId, name: inf.taskName },
        prompt: inf.prompt,
        parameters: inf.parameters,
        totalExamples: inf.totalExamples,
        processedExamples: inf.processedExamples,
      };

      return res.json({ success: true, meta });
    },
    "query"
  )
);

router.get(
  "/compare",
  ...validatedRoute(
    compareSchema,
    async (req, res) => {
      const infMeta: any[] = [];
      const modelsMeta: any[] = [];
      const evalMeta: any[] = [];
      let s3conn: S3Connection | undefined;

      for (const [idx, inferenceId] of req.query.inferenceIds.entries()) {
        const inference = await getInferenceObject(inferenceId, req.user.id);
        if (!inference) {
          return res
            .status(StatusCodes.NOT_FOUND)
            .json({ success: false, error: "Inference doesn't exist" });
        }
        if ((inference.status !== "done" && inference.status !== "canceled") || !inference.inferenceObjectKey) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            error: `Inference ${inferenceId} not finished yet`,
          });
        }

        if (!s3conn) {
          s3conn = await new S3Connection().connect();
          await s3conn.createTable("dataset", inference.datasetObjectKey);
        }

        const tbl = `inference_${inferenceId}`;
        const alias = `t${idx}`;
        await s3conn.createTable("inference", inference.inferenceObjectKey, tbl);

        infMeta.push({ table: tbl, alias, model: inference.model });

        // Select one completed evaluation per inference (defaults to the first done eval)
        const evaluations = await getInferenceEvaluations(inferenceId, req.user.id);
        const completedEvals = evaluations.filter((e) => e.status === "done");
        const requestedEvaluationId = req.query.evaluationIds?.[idx];
        const selectedEvaluationId =
          requestedEvaluationId ?? completedEvals[0]?.evaluationId;

        if (
          requestedEvaluationId &&
          !completedEvals.some((e) => e.evaluationId === requestedEvaluationId)
        ) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            success: false,
            error: `Evaluation ${requestedEvaluationId} is not a completed evaluation for inference ${inferenceId}`,
          });
        }

        const evalsToLoad = selectedEvaluationId
          ? completedEvals.filter((e) => e.evaluationId === selectedEvaluationId)
          : [];
        let hasLoadedEvaluation = false;

        for (const completedEval of evalsToLoad) {
          const evalObject = await getEvaluationObject(
            completedEval.evaluationId,
            req.user.id
          );
          if (!evalObject || !evalObject.evaluationObjectKey) {
            continue;
          }

          const evalTbl = `evaluation_${inferenceId}`;
          await s3conn.createTable("evaluation", evalObject.evaluationObjectKey, evalTbl);
          evalMeta.push({
            table: evalTbl,
            model: inference.model,
          });
          hasLoadedEvaluation = true;
        }

        modelsMeta.push({
          idx,
          inferenceId,
          model: inference.model,
          provider: {
            id: inference.providerId as string,
            name: inference.providerName,
          },
          status: inference.status,
          dataset: {
            id: inference.datasetId,
            name: inference.datasetName,
          },
          task: {
            id: inference.taskId,
            name: inference.taskName,
          },
          parameters: inference.parameters,
          evaluations: completedEvals.map((e) => ({
            evaluationId: e.evaluationId,
            metrics: e.metrics,
          })),
          selectedEvaluationId: hasLoadedEvaluation ? selectedEvaluationId : null,
          hasEvaluation: hasLoadedEvaluation,
        });
      }

      if (!s3conn) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR);
      }

      // Build SQL to fetch raw outputs
      const selectCols = [
        "dataset.id",
        "dataset.input",
        "dataset.reference",
        ...infMeta.map(
          ({ alias, model }) => `${alias}.output AS "${model}Output"`
        ),
      ].join(", ");

      const joins = infMeta
        .map(
          ({ table, alias }) =>
            `JOIN ${table} AS ${alias} ON dataset.id = ${alias}.id`
        )
        .join("\n");

      const sql = `
        SELECT ${selectCols}
        FROM dataset
        ${joins};
      `;

      const result = await s3conn.con.runAndReadAll(sql);
      const records = result.getRowObjectsJson();

      // Fetch parsed outputs and metrics from evaluations and merge
      const modelMetricSets: Record<string, Set<string>> = {};
      const aggregateMetrics: Record<string, Record<string, number>> = {}; // modelName -> {metricName: value}
      
      for (const evalMetaItem of evalMeta) {
        // Fetch aggregate metrics for this evaluation
        const aggregateResult = await s3conn.con.runAndReadAll(`
          SELECT aggregate
          FROM ${evalMetaItem.table}
        `);
        
        const aggregateRow = aggregateResult.getRowObjectsJS()[0];
        if (aggregateRow?.aggregate && Array.isArray(aggregateRow.aggregate)) {
          const aggregateObj: Record<string, number> = {};
          aggregateRow.aggregate.forEach((item: any) => {
            if (item.key && item.value !== undefined) {
              aggregateObj[item.key] = item.value;
            }
          });
          aggregateMetrics[evalMetaItem.model] = {
            ...(aggregateMetrics[evalMetaItem.model] ?? {}),
            ...aggregateObj,
          };
        }
        
        // Fetch per-example metrics
        const evalResult = await s3conn.con.runAndReadAll(`
          SELECT 
            unnest(${evalMetaItem.table}.rows).id as id,
            unnest(${evalMetaItem.table}.rows).parsed as parsed,
            unnest(${evalMetaItem.table}.rows).metrics as metrics
          FROM ${evalMetaItem.table}
        `);
        
        const evalRows = evalResult.getRowObjectsJson();
        const parsedMap = new Map<string, string>();
        const metricsMap = new Map<string, Record<string, number>>();
        
        // First pass: collect all metrics from this evaluation
        const currentEvalMetrics = new Set<string>();
        evalRows.forEach((row: any) => {
          parsedMap.set(row.id, row.parsed);
          if (row.metrics && Array.isArray(row.metrics)) {
            // Convert DuckDB MAP format [{key: 'rouge1', value: 0.5}, ...] to object
            const metricsObj: Record<string, number> = {};
            row.metrics.forEach((item: any) => {
              if (item.key && item.value !== undefined) {
                metricsObj[item.key] = item.value;
                currentEvalMetrics.add(item.key);
              }
            });
            metricsMap.set(row.id, metricsObj);
          }
        });
        
        if (!modelMetricSets[evalMetaItem.model]) {
          modelMetricSets[evalMetaItem.model] = new Set<string>();
        }
        currentEvalMetrics.forEach((m) => modelMetricSets[evalMetaItem.model].add(m));
        
        // Merge parsed outputs and metrics into records
        records.forEach((record: any) => {
          const parsed = parsedMap.get(record.id);
          if (parsed !== undefined) {
            record[`${evalMetaItem.model}Parsed`] = parsed;
          }
          
          const metrics = metricsMap.get(record.id);
          if (metrics) {
            Object.entries(metrics).forEach(([metricName, metricValue]) => {
              record[`${evalMetaItem.model}:${metricName}`] = metricValue;
            });
          }
        });
      }

      const comparedModelNames = modelsMeta.map((m) => m.model);
      const uniqueComparedModelNames = Array.from(new Set(comparedModelNames));
      let commonMetrics = new Set<string>();
      if (uniqueComparedModelNames.length > 0) {
        const firstMetrics =
          modelMetricSets[uniqueComparedModelNames[0]] ?? new Set<string>();
        commonMetrics = new Set(firstMetrics);

        for (let i = 1; i < uniqueComparedModelNames.length; i++) {
          const modelMetrics =
            modelMetricSets[uniqueComparedModelNames[i]] ?? new Set<string>();
          commonMetrics = new Set(
            Array.from(commonMetrics).filter((m) => modelMetrics.has(m))
          );
        }
      }

      await s3conn.dispose();

      res.json({ 
        success: true, 
        records, 
        meta: { 
          models: modelsMeta,
          commonMetrics: Array.from(commonMetrics).sort(),
          aggregateMetrics,
        } 
      });
    },
    "query"
  )
);

router.post(
  "/edit-note",
  ...validatedRoute(
    editNoteSchema,
    async (req, res) => {
      const validInference = await inferenceExists(
        req.body.inferenceId,
        req.user.id
      );
      if (!validInference) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      for (const note of req.body.notes) {
        await upsertNote(req.body.inferenceId, note.rowId, note.content);
      }

      res.json({ success: true });
    },
    "body"
  )
);

router.post(
  "/edit-highlight",
  ...validatedRoute(
    editHighlightSchema,
    async (req, res) => {
      const ok = await inferenceExists(req.body.inferenceId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      await Promise.all(
        req.body.highlights.map(({ rowId, start, end }) =>
          upsertHighlight(req.body.inferenceId, rowId, start, end)
        )
      );

      return res.json({ success: true });
    },
    "body"
  )
);

router.get(
  "/highlights",
  ...validatedRoute(
    z.object({
      inferenceId: z.string().nonempty(),
    }),
    async (req, res) => {
      const { inferenceId } = req.query;

      const ok = await inferenceExists(inferenceId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      const highlights = await getHighlights(inferenceId);

      return res.json({ success: true, highlights });
    },
    "query"
  )
);

const deleteHighlightSchema = z.object({
  inferenceId: z.string().nonempty(),
  rowIds: z.array(z.string().nonempty()).min(1),
});

router.post(
  "/delete-highlight",
  ...validatedRoute(
    deleteHighlightSchema,
    async (req, res) => {
      const { inferenceId, rowIds } = req.body;

      const ok = await inferenceExists(inferenceId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      await deleteHighlights(inferenceId, rowIds);
      return res.json({ success: true });
    },
    "body"
  )
);

// Proxy to inference-service HTTP server for statistical analysis
router.post("/statistical-analysis", async (req: AuthedRequest<{}>, res) => {
  try {
    const inferenceServiceUrl =
      process.env.INFERENCE_SERVICE_URL ?? "http://inference:8000";
    const response = await fetch(`${inferenceServiceUrl}/statistics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const result = await response.json();
    res.json(result);
  } catch (err: any) {
    console.error("[statistical-analysis] proxy error:", err.message);
    res.status(502).json({ error: "Statistics service unavailable" });
  }
});

const deleteInferenceSchema = z.object({
  inferenceId: z.string().nonempty(),
});

router.post(
  "/delete",
  ...validatedRoute(
    deleteInferenceSchema,
    async (req, res) => {
      const { inferenceId } = req.body;

      const ok = await inferenceExists(inferenceId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      // Delete all related data in order (cascade delete)
      await deleteEvaluationsByInference(inferenceId, req.user.id);
      await deleteNotesByInference(inferenceId);
      await deleteHighlightsByInference(inferenceId);
      
      // Finally delete the inference itself
      await deleteInference(inferenceId, req.user.id);
      
      return res.json({ success: true });
    },
    "body"
  )
);

const toggleFavoriteSchema = z.object({
  inferenceId: z.string().nonempty(),
  isFavorite: z.boolean(),
});

router.post(
  "/toggle-favorite",
  ...validatedRoute(
    toggleFavoriteSchema,
    async (req, res) => {
      const { inferenceId, isFavorite } = req.body;

      const ok = await inferenceExists(inferenceId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      await toggleFavoriteInference(inferenceId, req.user.id, isFavorite);
      return res.json({ success: true });
    },
    "body"
  )
);

const copyInferenceSchema = z.object({
  inferenceId: z.string().nonempty(),
});

router.post(
  "/copy",
  ...validatedRoute(
    copyInferenceSchema,
    async (req, res) => {
      const { inferenceId } = req.body;

      const ok = await inferenceExists(inferenceId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      const originalData = await copyInference(inferenceId, req.user.id);
      const newInferenceId = randomId(6);

      const newInference: NewInference = {
        ...originalData,
        inferenceId: newInferenceId,
        userId: req.user.id,
        status: "pending",
        objectKey: null,
        isFavorite: false,
      };

      await createInference(newInference);
      rmqClient.sendInference(newInferenceId);

      return res.json({ success: true, inferenceId: newInferenceId });
    },
    "body"
  )
);

const cancelInferenceSchema = z.object({
  inferenceId: z.string().nonempty(),
});

router.post(
  "/cancel",
  ...validatedRoute(
    cancelInferenceSchema,
    async (req, res) => {
      const { inferenceId } = req.body;

      const ok = await inferenceExists(inferenceId, req.user.id);
      if (!ok) {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Inference doesn't exist" });
      }

      await cancelInference(inferenceId, req.user.id);
      return res.json({ success: true });
    },
    "body"
  )
);

export default router;
