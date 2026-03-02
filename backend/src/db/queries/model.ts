import { eq } from "drizzle-orm";
import { db } from "..";
import { model, provider } from "../schema";

export async function getModel(modelName: string) {
  const rows = await db
    .select({
      parameters: provider.parameters,
    })
    .from(model)
    .innerJoin(provider, eq(model.providerId, provider.providerId))
    .where(eq(model.name, modelName))
    .limit(1);
  return rows[0];
}
