import { db } from "../src/db";
import { model as modelTable } from "../src/db/schema";

const huggingFaceModels = [
  "meta-llama/Llama-3.1-8B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
  "google/medgemma-1.5-4b-it",
];

const azureModels = [
  "gpt-4o",
  "gpt-5",
  "gpt-5.4",
  "o1",
  "o3",
  "o3-mini",
  "o4-mini",
];

const anthropicModels = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
];

const googleModels = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
];

async function seedModels() {
  console.log("Seeding model catalog...");

  for (const modelName of huggingFaceModels) {
    await db
      .insert(modelTable)
      .values({
        name: modelName,
        providerId: "huggingface",
      })
      .onConflictDoNothing();

    console.log(`- ensured model exists: ${modelName}`);
  }

  for (const modelName of azureModels) {
    await db
      .insert(modelTable)
      .values({
        name: modelName,
        providerId: "azure",
      })
      .onConflictDoNothing();

    console.log(`- ensured model exists: ${modelName}`);
  }

  for (const modelName of anthropicModels) {
    await db
      .insert(modelTable)
      .values({
        name: modelName,
        providerId: "anthropic",
      })
      .onConflictDoNothing();

    console.log(`- ensured model exists: ${modelName}`);
  }

  for (const modelName of googleModels) {
    await db
      .insert(modelTable)
      .values({
        name: modelName,
        providerId: "google",
      })
      .onConflictDoNothing();

    console.log(`- ensured model exists: ${modelName}`);
  }

  console.log("Done seeding model catalog");
  process.exit(0);
}

seedModels().catch((error) => {
  console.error("Failed to seed model catalog:", error);
  process.exit(1);
});
