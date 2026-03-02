import { eq, or, sql } from "drizzle-orm";
import { db } from "..";
import { task } from "../schema";

export async function getTasks() {
  return db
    .select({
      name: task.name,
      id: task.id
    })
    .from(task);
}

export async function taskExists(taskId: string) {
  const rows = await db
    .select({
      exists: sql<number>`1`,
    })
    .from(task)
    .where(eq(task.id, taskId));
  return rows.length > 0;
}
