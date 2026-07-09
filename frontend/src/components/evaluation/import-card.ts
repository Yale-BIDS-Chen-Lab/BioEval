export type DatasetListItem = {
  datasetId: string;
  name: string;
  taskId: string;
  taskName: string;
};

export type ImportCard = {
  dataset: { name: string; task: { id: string; name: string } };
  prompt: { template: string };
  model: {
    identifier: string;
    provider: string;
    parameters: { id: string; value: unknown }[];
  };
  evaluation: {
    metrics: string[];
    parsingFunctions?: unknown;
    llmJudge?: unknown;
  };
  [key: string]: unknown;
};

export function parseCard(
  text: string
): { card: ImportCard } | { error: string } {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    return { error: "This is not valid JSON." };
  }
  if (!obj || typeof obj !== "object")
    return { error: "This is not a valid evaluation card." };
  if (
    typeof obj.dataset?.name !== "string" ||
    typeof obj.dataset?.task?.id !== "string" ||
    typeof obj.dataset?.task?.name !== "string"
  )
    return { error: "Card is missing the dataset name or task." };
  if (typeof obj.prompt?.template !== "string")
    return { error: "Card is missing the prompt template." };
  if (
    typeof obj.model?.identifier !== "string" ||
    typeof obj.model?.provider !== "string"
  )
    return { error: "Card is missing the model identifier or provider." };
  if (
    !Array.isArray(obj.evaluation?.metrics) ||
    obj.evaluation.metrics.length === 0 ||
    !obj.evaluation.metrics.every((m: unknown) => typeof m === "string")
  )
    return { error: "Card has no evaluation metrics." };
  return { card: obj as ImportCard };
}

export function matchDataset(
  card: ImportCard,
  datasets: DatasetListItem[]
): DatasetListItem | null {
  return (
    datasets.find(
      (ds) =>
        ds.name === card.dataset.name && ds.taskId === card.dataset.task.id
    ) ?? null
  );
}

export function buildInferenceBody(
  card: ImportCard,
  datasetId: string,
  projectId: string
) {
  return {
    datasetId,
    prompt: card.prompt.template,
    projectId,
    models: [
      {
        model: card.model.identifier,
        provider: card.model.provider,
        parameters: Array.isArray(card.model.parameters)
          ? card.model.parameters
          : [],
      },
    ],
  };
}

export function buildEvaluationBody(
  card: ImportCard,
  inferenceId: string,
  projectId: string
) {
  return {
    inferenceId,
    projectId,
    metrics: card.evaluation.metrics,
    parsingFunctions: Array.isArray(card.evaluation.parsingFunctions)
      ? card.evaluation.parsingFunctions
      : [],
    llmJudgeConfig:
      card.evaluation.llmJudge && typeof card.evaluation.llmJudge === "object"
        ? card.evaluation.llmJudge
        : {},
  };
}
