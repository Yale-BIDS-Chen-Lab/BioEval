import { eq } from "drizzle-orm";
import { db } from "..";
import { note } from "../schema";

export async function upsertNote(
  inferenceId: string,
  rowId: string,
  content: string
) {
  await db
    .insert(note)
    .values({ inferenceId, rowId, content })
    .onConflictDoUpdate({
      target: [note.inferenceId, note.rowId],
      set: { content },
    });
}

export async function getNotes(inferenceId: string) {
  const rows = await db
    .select({
      rowId: note.rowId,
      content: note.content,
    })
    .from(note)
    .where(eq(note.inferenceId, inferenceId));

  return Object.fromEntries(rows.map((r) => [r.rowId, r.content]));
}

export async function deleteNotesByInference(inferenceId: string) {
  return db.delete(note).where(eq(note.inferenceId, inferenceId));
}
