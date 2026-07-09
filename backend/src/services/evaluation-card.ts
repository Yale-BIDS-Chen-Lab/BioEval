export type EvaluationCardRecipePieces = {
  dataset: {
    id: string;
    name: string;
    task: { id: string; name: string };
    classes: unknown | null;
  };
  prompt: string;
  model: { provider: string; identifier: string; parameters: unknown };
  metrics: unknown;
  parsingFunctions: unknown | null;
  llmJudgeConfig: unknown | null;
};

export type EvaluationCard = {
  bioeval: { cardVersion: string; exportedAt: string };
  dataset: {
    id: string;
    name: string;
    task: { id: string; name: string };
    classes: unknown | null;
  };
  prompt: { template: string };
  model: { provider: string; identifier: string; parameters: unknown };
  evaluation: {
    metrics: unknown;
    parsingFunctions: unknown | null;
    llmJudge: unknown | null;
  };
};

export function buildEvaluationCard(
  p: EvaluationCardRecipePieces,
  exportedAt: string
): EvaluationCard {
  return {
    bioeval: { cardVersion: "1.0", exportedAt },
    dataset: p.dataset,
    prompt: { template: p.prompt },
    model: p.model,
    evaluation: {
      metrics: p.metrics,
      parsingFunctions: p.parsingFunctions ?? null,
      llmJudge: p.llmJudgeConfig ?? null,
    },
  };
}
