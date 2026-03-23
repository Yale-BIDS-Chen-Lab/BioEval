import { and, eq, inArray } from "drizzle-orm";
import { db } from "..";
import { evaluation, humanScore } from "../schema";

type EvaluationLifecycleStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "canceled";

export async function upsertHumanScore(
  evaluationId: string,
  rowId: string,
  score: number
) {
  await db
    .insert(humanScore)
    .values({ evaluationId, rowId, score })
    .onConflictDoUpdate({
      target: [humanScore.evaluationId, humanScore.rowId],
      set: { score },
    });
}

export async function deleteHumanScores(
  evaluationId: string,
  rowIds: string[]
) {
  if (!rowIds.length) return;

  await db
    .delete(humanScore)
    .where(
      and(
        eq(humanScore.evaluationId, evaluationId),
        inArray(humanScore.rowId, rowIds)
      )
    );
}

export async function getHumanScores(evaluationId: string) {
  const rows = await db
    .select({
      rowId: humanScore.rowId,
      score: humanScore.score,
    })
    .from(humanScore)
    .where(eq(humanScore.evaluationId, evaluationId));

  return Object.fromEntries(rows.map((row) => [row.rowId, row.score]));
}

export async function getHumanScoreAggregate(evaluationId: string) {
  const rows = await db
    .select({
      score: humanScore.score,
    })
    .from(humanScore)
    .where(eq(humanScore.evaluationId, evaluationId));

  if (rows.length === 0) {
    return {
      human_evaluation_mean: null,
      human_evaluation_count: 0,
    };
  }

  const values = rows.map((row) => row.score);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    human_evaluation_mean: mean,
    human_evaluation_count: values.length,
  };
}

export async function getEffectiveEvaluationStatus({
  evaluationId,
  metrics,
  status,
  totalExamples,
}: {
  evaluationId: string;
  metrics: unknown;
  status: EvaluationLifecycleStatus;
  totalExamples?: number | null;
}) {
  const metricList = Array.isArray(metrics)
    ? metrics.filter((metric): metric is string => typeof metric === "string")
    : [];

  if (!metricList.includes("human_evaluation") || status !== "done") {
    return {
      status,
      ratedRows: 0,
      totalRows: totalExamples ?? 0,
    };
  }

  const aggregate = await getHumanScoreAggregate(evaluationId);
  const totalRows =
    typeof totalExamples === "number" && totalExamples > 0
      ? totalExamples
      : aggregate.human_evaluation_count;

  return {
    status:
      totalRows > 0 && aggregate.human_evaluation_count < totalRows
        ? ("processing" as const)
        : ("done" as const),
    ratedRows: aggregate.human_evaluation_count,
    totalRows,
  };
}

export async function deleteHumanScoresByEvaluation(evaluationId: string) {
  return db.delete(humanScore).where(eq(humanScore.evaluationId, evaluationId));
}

export async function deleteHumanScoresByInference(inferenceId: string) {
  const evaluationRows = await db
    .select({
      evaluationId: evaluation.evaluationId,
    })
    .from(evaluation)
    .where(eq(evaluation.inferenceId, inferenceId));

  const evaluationIds = evaluationRows.map((row) => row.evaluationId);
  if (!evaluationIds.length) return;

  await db
    .delete(humanScore)
    .where(inArray(humanScore.evaluationId, evaluationIds));
}
