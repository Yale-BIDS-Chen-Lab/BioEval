import { and, eq } from "drizzle-orm";
import { db } from "..";
import { IntegrationArguments } from "../../schemas/user";
import { integration, integrationConfig, provider } from "../schema";

export async function getIntegrations() {
  return db
    .select({
      schema: integration.schema,
      providerName: provider.name,
      providerId: integration.providerId,
    })
    .from(integration)
    .innerJoin(provider, eq(integration.providerId, provider.providerId));
}

export async function getIntegration(providerId: string) {
  const rows = await db
    .select({
      schema: integration.schema,
    })
    .from(integration)
    .where(eq(integration.providerId, providerId))
    .limit(1);

  return rows[0];
}

export async function upsertIntegration(
  providerId: string,
  userId: string,
  settings: IntegrationArguments
) {
  await db
    .insert(integrationConfig)
    .values({ providerId, userId, settings })
    .onConflictDoUpdate({
      target: [integrationConfig.userId, integrationConfig.providerId],
      set: { settings },
    });
}

export async function getUserConfig(providerId: string, userId: string) {
  const rows = await db
    .select({
      settings: integrationConfig.settings,
    })
    .from(integrationConfig)
    .where(
      and(
        eq(integrationConfig.providerId, providerId),
        eq(integrationConfig.userId, userId)
      )
    )
    .limit(1);

  return rows[0];
}
