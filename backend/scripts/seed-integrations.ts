import { db } from "../src/db";
import { integration } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

const integrations = [
  {
    provider: "huggingface",
    schema: z.object({
      token: z.string().nonempty(),
    }),
  },
  {
    provider: "azure",
    schema: z.object({
      endpoint: z.string().nonempty(),
      version: z.string().nonempty(),
      apiKey: z.string().nonempty(),
    }),
  },
  {
    provider: "anthropic",
    schema: z.object({
      apiKey: z.string().nonempty(),
    }),
  },
];

async function seedIntegrations() {
  console.log("Seeding integrations...");
  
  for (const integrationData of integrations) {
    try {
      const existing = await db
        .select({ id: integration.id })
        .from(integration)
        .where(eq(integration.providerId, integrationData.provider))
        .limit(1);

      if (existing.length > 0) {
        console.log(`- Integration for ${integrationData.provider} already exists`);
        continue;
      }

      await db.insert(integration).values({
        providerId: integrationData.provider,
        schema: z.toJSONSchema(integrationData.schema),
      });
      console.log(`✓ Inserted integration for ${integrationData.provider}`);
    } catch (error: any) {
      console.error(`✗ Error inserting ${integrationData.provider}:`, error.message);
    }
  }
  
  console.log("Done seeding integrations");
  process.exit(0);
}

seedIntegrations();
