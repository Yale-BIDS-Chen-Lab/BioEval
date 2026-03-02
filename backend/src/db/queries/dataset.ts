import { eq, or, and, sql } from "drizzle-orm";
import { db } from "..";
import { dataset, NewDataset, task } from "../schema";

export async function getDatasets(userId: string) {
  return db
    .select({
      datasetId: dataset.datasetId,
      name: dataset.name,
      description: dataset.description,
      taskId: dataset.taskId,
      taskName: task.name,
      userOwned: sql`
        COALESCE(${dataset.ownerId} = ${userId}, FALSE)
      `.as("userOwned"),
    })
    .from(dataset)
    .innerJoin(task, eq(task.id, dataset.taskId))
    .where(or(eq(dataset.ownerId, userId), eq(dataset.isPublic, true)));
}

// implicitly user scoped
export async function datasetExists(datasetId: string, userId: string) {
  const rows = await db
    .select({
      exists: sql<number>`1`,
    })
    .from(dataset)
    .where(
      and(
        eq(dataset.datasetId, datasetId),
        or(eq(dataset.ownerId, userId), eq(dataset.isPublic, true))
      )
    );
  return rows.length > 0;
}

export async function getDatasetObject(datasetId: string, userId: string) {
  const rows = await db
    .select({
      datasetId: dataset.datasetId,
      name: dataset.name,
      description: dataset.description,
      defaultPrompt: dataset.defaultPrompt,
      objectKey: dataset.objectKey,
      taskName: task.name,
      taskId: dataset.taskId,
    })
    .from(dataset)
    .innerJoin(task, eq(task.id, dataset.taskId))
    .where(
      and(
        or(eq(dataset.ownerId, userId), eq(dataset.isPublic, true)),
        eq(dataset.datasetId, datasetId)
      )
    )
    .limit(1);
  return rows[0];
}

export async function getDatasetObjectKey(datasetId: string, userId: string) {
  const rows = await db
    .select({
      objectKey: dataset.objectKey,
    })
    .from(dataset)
    .where(
      and(
        or(eq(dataset.ownerId, userId), eq(dataset.isPublic, true)),
        eq(dataset.datasetId, datasetId)
      )
    )
    .limit(1);
  return rows[0];
}

export async function createDataset(newDataset: NewDataset) {
  return db.insert(dataset).values(newDataset);
}

export async function deleteDataset(datasetId: string, userId: string) {
  return db
    .delete(dataset)
    .where(
      and(eq(dataset.datasetId, datasetId), eq(dataset.ownerId, userId))
    );
}
