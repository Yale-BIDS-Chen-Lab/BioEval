export type EvaluationCardPieces = {
  evaluationId: string;
  inferenceId: string;
  datasetId: string;
  status: string;
  meta: {
    // fields buildEvaluationCard reads:
    model: string;
    provider: { id: string; name: string };
    dataset: { id: string; name: string };
    task: { id: string; name: string };
    prompt: string;
    parameters: unknown;
    evaluationMetrics: unknown;
    // extra fields the assembler carries for /dataview (superset avoids type friction):
    status?: string;
    totalExamples?: number | null;
    processedExamples?: number | null;
    humanEvaluationProgress?: unknown;
  };
  aggregate: Record<string, unknown>;
  records: Record<string, unknown>[];
  parsingFunctions: unknown | null;
  llmJudgeConfig: unknown | null;
  datasetClasses: unknown | null;
};

export type EvaluationCard = {
  bioeval: { cardVersion: string; exportedAt: string };
  evaluation: {
    evaluationId: string;
    inferenceId: string;
    datasetId: string;
    status: string;
  };
  dataset: {
    id: string;
    name: string;
    task: { id: string; name: string };
    canonicalSchema: string[];
    classes: unknown | null;
  };
  prompt: { template: string };
  model: {
    provider: { id: string; name: string };
    identifier: string;
    parameters: unknown;
  };
  postprocessing: unknown | null;
  metrics: { list: unknown; llmJudge: unknown | null };
  aggregate: Record<string, unknown>;
  records: Record<string, unknown>[];
};

export class EvaluationCardIncompleteError extends Error {
  constructor(message = "Evaluation is not complete; cannot build a card") {
    super(message);
    this.name = "EvaluationCardIncompleteError";
  }
}

export function buildEvaluationCard(
  p: EvaluationCardPieces,
  exportedAt: string
): EvaluationCard {
  if (p.status !== "done") {
    throw new EvaluationCardIncompleteError();
  }
  return {
    bioeval: { cardVersion: "1.0", exportedAt },
    evaluation: {
      evaluationId: p.evaluationId,
      inferenceId: p.inferenceId,
      datasetId: p.datasetId,
      status: p.status,
    },
    dataset: {
      id: p.meta.dataset.id,
      name: p.meta.dataset.name,
      task: p.meta.task,
      canonicalSchema: ["id", "input", "reference"],
      classes: p.datasetClasses ?? null,
    },
    prompt: { template: p.meta.prompt },
    model: {
      provider: p.meta.provider,
      identifier: p.meta.model,
      parameters: p.meta.parameters,
    },
    postprocessing: p.parsingFunctions ?? null,
    metrics: { list: p.meta.evaluationMetrics, llmJudge: p.llmJudgeConfig ?? null },
    aggregate: p.aggregate,
    records: p.records,
  };
}
