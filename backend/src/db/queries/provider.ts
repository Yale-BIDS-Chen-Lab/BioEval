import { eq, sql } from "drizzle-orm";
import { db } from "..";
import { model, provider } from "../schema";

export async function providerExists(providerId: string) {
  const rows = await db
    .select({
      exists: sql<number>`1`,
    })
    .from(provider)
    .where(eq(provider.providerId, providerId));
  return rows.length > 0;
}

const modelsAgg = sql<
  { id: number; name: string; providerId: string }[]
>`json_agg(
     json_build_object(
       'id', ${model.id},
       'name', ${model.name},
       'providerId', ${model.providerId}
     )
   )`.as("models");

export async function getProviders() {
  return db
    .select({
      name: provider.name,
      providerId: provider.providerId,
      parameters: provider.parameters,
      models: modelsAgg,
    })
    .from(provider)
    .leftJoin(model, eq(model.providerId, provider.providerId))
    .groupBy(provider.providerId, provider.name, provider.parameters);
}

