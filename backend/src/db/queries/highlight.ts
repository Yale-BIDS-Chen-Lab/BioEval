import { and, eq, inArray } from "drizzle-orm";
import { db } from "..";
import { highlight } from "../schema";

export async function upsertHighlight(
  inferenceId: string,
  rowId: string,
  start: number,
  end: number
) {
  await db
    .insert(highlight)
    .values({ inferenceId, rowId, start, end })
    .onConflictDoUpdate({
      target: [highlight.inferenceId, highlight.rowId],
      set: { start, end },
    });
}

export async function getHighlights(inferenceId: string) {
  const rows = await db
    .select({
      rowId: highlight.rowId,
      start: highlight.start,
      end: highlight.end,
    })
    .from(highlight)
    .where(eq(highlight.inferenceId, inferenceId));

  return Object.fromEntries(
    rows.map((r) => [r.rowId, { start: r.start, end: r.end }])
  );
}

export async function deleteHighlights(inferenceId: string, rowIds: string[]) {
  if (!rowIds.length) return;
  await db
    .delete(highlight)
    .where(
      and(
        eq(highlight.inferenceId, inferenceId),
        inArray(highlight.rowId, rowIds)
      )
    );
}

export async function deleteHighlightsByInference(inferenceId: string) {
  return db.delete(highlight).where(eq(highlight.inferenceId, inferenceId));
}
