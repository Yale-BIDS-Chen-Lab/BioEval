import { db } from "../src/db";
import { model as modelTable } from "../src/db/schema";

const huggingFaceModels = [
  "meta-llama/Llama-3.1-8B-Instruct",
  "meta-llama/Llama-3.2-1B",
  "meta-llama/Llama-3.2-1B-Instruct",
  "meta-llama/Llama-3.2-3B",
  "meta-llama/Llama-3.2-3B-Instruct",
  "google/medgemma-4b-it",
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

  console.log("Done seeding model catalog");
  process.exit(0);
}

seedModels().catch((error) => {
  console.error("Failed to seed model catalog:", error);
  process.exit(1);
});
