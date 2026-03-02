import { and, eq, sql } from "drizzle-orm";
import { db } from "..";
import { dataset, inference, NewInference, provider, task } from "../schema";

export async function createInference(newProject: NewInference) {
  return db.insert(inference).values(newProject);
}

// FIXME: optimize query
export async function getProjectInferences(projectId: string) {
  return db
    .select({
      inferenceId: inference.inferenceId,
      model: inference.model,
      providerId: inference.providerId,
      status: inference.status,
      task: task.name,
      taskId: task.id,
      dataset: dataset.name,
      isFavorite: inference.isFavorite,
      totalExamples: inference.totalExamples,
      processedExamples: inference.processedExamples,
    })
    .from(inference)
    .innerJoin(task, eq(task.id, inference.taskId))
    .innerJoin(dataset, eq(dataset.datasetId, inference.datasetId))
    .where(eq(inference.projectId, projectId))
    .orderBy(inference.id);
}

export async function getCompletedInferences(projectId: string) {
  return db
    .select({
      inferenceId: inference.inferenceId,
      model: inference.model,
      providerId: inference.providerId,
      taskId: task.id,
      dataset: dataset.name,
      classes: dataset.classes,
    })
    .from(inference)
    .innerJoin(task, eq(task.id, inference.taskId))
    .innerJoin(dataset, eq(dataset.datasetId, inference.datasetId))
    .where(
      and(eq(inference.projectId, projectId), eq(inference.status, "done"))
    )
    .orderBy(inference.id);
}

export async function inferenceExists(inferenceId: string, userId: string) {
  const rows = await db
    .select({
      exists: sql<number>`1`,
    })
    .from(inference)
    .where(
      and(eq(inference.inferenceId, inferenceId), eq(inference.userId, userId))
    );
  return rows.length > 0;
}

export async function getInferenceObject(inferenceId: string, userId: string) {
  const rows = await db
    .select({
      status: inference.status,
      inferenceObjectKey: inference.objectKey,
      datasetObjectKey: dataset.objectKey,
      prompt: inference.prompt,
      model: inference.model,

      providerId: inference.providerId,
      providerName: provider.name,

      datasetId: dataset.datasetId,
      datasetName: dataset.name,
      taskId: task.id,
      taskName: task.name,

      parameters: inference.parameters,
      totalExamples: inference.totalExamples,
      processedExamples: inference.processedExamples,
    })
    .from(inference)
    .innerJoin(dataset, eq(inference.datasetId, dataset.datasetId))
    .innerJoin(task, eq(inference.taskId, task.id))
    .innerJoin(provider, eq(inference.providerId, provider.providerId))
    .where(
      and(eq(inference.userId, userId), eq(inference.inferenceId, inferenceId))
    )
    .limit(1);
  return rows[0];
}

export async function deleteInference(inferenceId: string, userId: string) {
  return db
    .delete(inference)
    .where(
      and(eq(inference.inferenceId, inferenceId), eq(inference.userId, userId))
    );
}

export async function toggleFavoriteInference(
  inferenceId: string,
  userId: string,
  isFavorite: boolean
) {
  return db
    .update(inference)
    .set({ isFavorite })
    .where(
      and(eq(inference.inferenceId, inferenceId), eq(inference.userId, userId))
    );
}

export async function cancelInference(inferenceId: string, userId: string) {
  return db
    .update(inference)
    .set({ status: "canceled" })
    .where(
      and(eq(inference.inferenceId, inferenceId), eq(inference.userId, userId))
    );
}

export async function copyInference(inferenceId: string, userId: string) {
  const original = await db
    .select({
      taskId: inference.taskId,
      datasetId: inference.datasetId,
      prompt: inference.prompt,
      model: inference.model,
      providerId: inference.providerId,
      parameters: inference.parameters,
      projectId: inference.projectId,
    })
    .from(inference)
    .where(
      and(eq(inference.inferenceId, inferenceId), eq(inference.userId, userId))
    )
    .limit(1);

  if (!original[0]) {
    throw new Error("Inference not found");
  }

  return original[0];
}

export async function getProjectInferenceIds(projectId: string, userId: string) {
  const rows = await db
    .select({
      inferenceId: inference.inferenceId,
    })
    .from(inference)
    .where(
      and(eq(inference.projectId, projectId), eq(inference.userId, userId))
    );
  return rows.map(r => r.inferenceId);
}

export async function getDatasetInferenceIds(datasetId: string, userId: string) {
  const rows = await db
    .select({
      inferenceId: inference.inferenceId,
    })
    .from(inference)
    .where(
      and(eq(inference.datasetId, datasetId), eq(inference.userId, userId))
    );
  return rows.map(r => r.inferenceId);
}
