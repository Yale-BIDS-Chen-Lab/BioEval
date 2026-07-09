export type EvaluationCardRecipePieces = {
  status: string;
  task: { id: string; name: string };
  dataset: {
    name: string;
    defaultPrompt: string;
    classes: unknown | null;
    rows: { id: string; input: string; reference: string }[];
  };
  prompt: string;
  model: { provider: string; identifier: string; parameters: unknown };
  metrics: unknown;
  parsingFunctions: unknown | null;
  llmJudgeConfig: unknown | null;
};

export type EvaluationCard = {
  bioeval: { cardVersion: string; exportedAt: string };
  task: { id: string; name: string };
  dataset: {
    name: string;
    defaultPrompt: string;
    classes: unknown | null;
    rows: { id: string; input: string; reference: string }[];
  };
  prompt: { template: string };
  model: { provider: string; identifier: string; parameters: unknown };
  evaluation: {
    metrics: unknown;
    parsingFunctions: unknown | null;
    llmJudge: unknown | null;
  };
};

export class EvaluationCardIncompleteError extends Error {
  constructor(message = "Evaluation is not complete; cannot build a card") {
    super(message);
    this.name = "EvaluationCardIncompleteError";
  }
}

export function buildEvaluationCard(
  p: EvaluationCardRecipePieces,
  exportedAt: string
): EvaluationCard {
  if (p.status !== "done") {
    throw new EvaluationCardIncompleteError();
  }
  return {
    bioeval: { cardVersion: "1.0", exportedAt },
    task: p.task,
    dataset: {
      name: p.dataset.name,
      defaultPrompt: p.dataset.defaultPrompt,
      classes: p.dataset.classes ?? null,
      rows: p.dataset.rows,
    },
    prompt: { template: p.prompt },
    model: p.model,
    evaluation: {
      metrics: p.metrics,
      parsingFunctions: p.parsingFunctions ?? null,
      llmJudge: p.llmJudgeConfig ?? null,
    },
  };
}
