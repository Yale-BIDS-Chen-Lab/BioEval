import { eq, sql, or, isNull } from "drizzle-orm";
import { db } from "..";
import { parsingFunction } from "../schema";

export async function parsingFunctionExists(funcId: string) {
  const rows = await db
    .select({
      exists: sql<number>`1`,
    })
    .from(parsingFunction)
    .where(eq(parsingFunction.funcId, funcId));
  return rows.length > 0;
}

export async function getParsingFunctions(userId?: string) {
  // Return built-in functions (isCustom = false OR isCustom is NULL) + user's custom functions
  if (userId) {
    // Return all built-in functions + this user's custom functions
    return db
      .select({
        name: parsingFunction.name,
        taskId: parsingFunction.funcId,
        parameters: parsingFunction.parameters,
        code: parsingFunction.code,
        isCustom: parsingFunction.isCustom,
        userId: parsingFunction.userId,
      })
      .from(parsingFunction)
      .where(
        or(
          eq(parsingFunction.isCustom, false),
          isNull(parsingFunction.isCustom),
          eq(parsingFunction.userId, userId)
        )
      );
  }
  
  // If no userId provided, only return built-in functions
  return db
    .select({
      name: parsingFunction.name,
      taskId: parsingFunction.funcId,
      parameters: parsingFunction.parameters,
      code: parsingFunction.code,
      isCustom: parsingFunction.isCustom,
      userId: parsingFunction.userId,
    })
    .from(parsingFunction)
    .where(
      or(
        eq(parsingFunction.isCustom, false),
        isNull(parsingFunction.isCustom)
      )
    );
}

export async function getParsingFunction(funcId: string) {
  const rows = await db
    .select({
      parameters: parsingFunction.parameters,
      code: parsingFunction.code,
    })
    .from(parsingFunction)
    .where(eq(parsingFunction.funcId, funcId))
    .limit(1);
  return rows[0];
}

export async function createCustomParsingFunction(
  funcId: string,
  name: string,
  code: string,
  userId: string
) {
  const [result] = await db
    .insert(parsingFunction)
    .values({
      funcId,
      name,
      code,
      parameters: [], // Custom functions don't have parameters (args come from code)
      isCustom: true,
      userId,
    })
    .returning();
  return result;
}

export async function deleteCustomParsingFunction(
  funcId: string,
  userId: string
) {
  return db
    .delete(parsingFunction)
    .where(
      sql`${parsingFunction.funcId} = ${funcId} AND ${parsingFunction.userId} = ${userId} AND ${parsingFunction.isCustom} = true`
    );
}