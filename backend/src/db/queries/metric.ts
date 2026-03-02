import { eq, sql } from "drizzle-orm";
import { db } from "..";
import { metric } from "../schema";

export async function metricExists(metricId: string) {
  const rows = await db
    .select({
      exists: sql<number>`1`,
    })
    .from(metric)
    .where(eq(metric.metricId, metricId));
  return rows.length > 0;
}

export async function getMetrics() {
  return db
    .select({
      name: metric.name,
      metricId: metric.metricId,
      taskId: metric.taskId
    })
    .from(metric);
}
