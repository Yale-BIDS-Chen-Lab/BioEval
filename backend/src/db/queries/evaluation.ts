import { and, eq } from "drizzle-orm";
import { db } from "..";
import { dataset, evaluation, inference, NewEvaluation, provider, task } from "../schema";

let evaluationHasCreatedAtColumn: boolean | null = null;

export async function createEvaluation(newEvaluation: NewEvaluation) {
  return db.insert(evaluation).values(newEvaluation);
}

// TODO: rewrite
export async function getProjectEvaluations(projectId: string) {
  const evaluations = await db
    .select({
      evaluationId: evaluation.evaluationId,
      inferenceId: evaluation.inferenceId,
      status: evaluation.status,
      metrics: evaluation.metrics,
    })
    .from(evaluation)
    .where(eq(evaluation.projectId, projectId));
  return Promise.all(
    evaluations.map(async (evaluation) => {
      const model = await db
        .select({
          model: inference.model,
          providerId: inference.providerId,
        })
        .from(inference)
        .where(eq(inference.inferenceId, evaluation.inferenceId))
        .limit(1);
      return {
        ...evaluation,
        ...model[0],
      };
    })
  );
}

export async function getInferenceEvaluations(
  inferenceId: string,
  userId: string
) {
  if (evaluationHasCreatedAtColumn !== false) {
    try {
      const rows = await db
        .select({
          evaluationId: evaluation.evaluationId,
          status: evaluation.status,
          metrics: evaluation.metrics,
          createdAt: evaluation.createdAt,
        })
        .from(evaluation)
        .where(
          and(
            eq(evaluation.inferenceId, inferenceId),
            eq(evaluation.userId, userId)
          )
        );
      evaluationHasCreatedAtColumn = true;
      return rows;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const missingCreatedAtColumn =
        /column .*createdAt.* does not exist/i.test(message) ||
        /column .*created_at.* does not exist/i.test(message);
      if (!missingCreatedAtColumn) {
        throw error;
      }
      evaluationHasCreatedAtColumn = false;
    }
  }

  const rows = await db
    .select({
      evaluationId: evaluation.evaluationId,
      status: evaluation.status,
      metrics: evaluation.metrics,
    })
    .from(evaluation)
    .where(
      and(
        eq(evaluation.inferenceId, inferenceId),
        eq(evaluation.userId, userId)
      )
    );

  return rows.map((row) => ({ ...row, createdAt: null as string | null }));
}

export async function getEvaluationObject(
  evaluationId: string,
  userId: string
) {
  const rows = await db
    .select({
      status: evaluation.status,
      metrics: evaluation.metrics,
      prompt: inference.prompt,
      evaluationObjectKey: evaluation.objectKey,
      inferenceObjectKey: inference.objectKey,
      datasetObjectKey: dataset.objectKey,
      inferenceId: inference.inferenceId,

      modelName: inference.model,
      providerId: provider.providerId,
      providerName: provider.name,
      inferenceStatus: inference.status,
      datasetId: dataset.datasetId,
      datasetName: dataset.name,
      taskId: task.id,
      taskName: task.name,
      parameters: inference.parameters,
      totalExamples: inference.totalExamples,
      processedExamples: inference.processedExamples,
    })
    .from(evaluation)
    .innerJoin(inference, eq(inference.inferenceId, evaluation.inferenceId))
    .innerJoin(dataset, eq(inference.datasetId, dataset.datasetId))
    .innerJoin(provider, eq(inference.providerId, provider.providerId))
    .innerJoin(task, eq(inference.taskId, task.id))
    .where(
      and(
        eq(evaluation.userId, userId),
        eq(evaluation.evaluationId, evaluationId)
      )
    )
    .limit(1);
  return rows[0];
}

export async function deleteEvaluationsByInference(
  inferenceId: string,
  userId: string
) {
  return db
    .delete(evaluation)
    .where(
      and(eq(evaluation.inferenceId, inferenceId), eq(evaluation.userId, userId))
    );
}

export async function deleteEvaluation(
  evaluationId: string,
  userId: string
) {
  return db
    .delete(evaluation)
    .where(
      and(eq(evaluation.evaluationId, evaluationId), eq(evaluation.userId, userId))
    );
}
