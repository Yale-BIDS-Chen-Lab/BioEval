import { and, eq, sql } from "drizzle-orm";
import { db } from "..";
import { inference, NewProject, project } from "../schema";

export async function createProject(newProject: NewProject) {
  return db.insert(project).values(newProject);
}

// TODO: haven't verified performance impact
export async function getUserProjects(userId: string) {
  return db
    .select({
      projectId: project.projectId,
      name: project.name,
      providers: sql<string[]>`
      array_remove(array_agg(${inference.providerId}), NULL)`.as("providers"),
    })
    .from(project)
    .leftJoin(inference, eq(inference.projectId, project.projectId))
    .where(eq(project.userId, userId))
    .groupBy(project.projectId, project.name);
}

export async function getProject(projectId: string, userId: string) {
  const rows = await db
    .select()
    .from(project)
    .where(and(eq(project.projectId, projectId), eq(project.userId, userId)))
    .limit(1);
  return rows[0];
}

// implicitly user scoped
export async function projectExists(projectId: string, userId: string) {
  const rows = await db
    .select({
      exists: sql<number>`1`,
    })
    .from(project)
    .where(and(eq(project.projectId, projectId), eq(project.userId, userId)));
  return rows.length > 0;
}

export async function renameProject(
  projectId: string,
  userId: string,
  newName: string
) {
  return db
    .update(project)
    .set({ name: newName })
    .where(and(eq(project.projectId, projectId), eq(project.userId, userId)));
}

export async function deleteProject(projectId: string, userId: string) {
  return db
    .delete(project)
    .where(and(eq(project.projectId, projectId), eq(project.userId, userId)));
}
