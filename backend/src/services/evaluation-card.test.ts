import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildEvaluationCard,
  type EvaluationCardRecipePieces,
} from "./evaluation-card";

function recipe(): EvaluationCardRecipePieces {
  return {
    dataset: {
      id: "ds123",
      name: "HoC",
      task: { id: "mlc", name: "Multi-label classification" },
      classes: ["hallmark-a", "hallmark-b"],
    },
    prompt: "Classify: {{input}}",
    model: {
      provider: "azure",
      identifier: "gpt-5.4",
      parameters: [{ id: "max_tokens", value: 8192 }],
    },
    metrics: ["rougeL", "bertscore"],
    parsingFunctions: [{ id: "section-parser", arguments: [] }],
    llmJudgeConfig: { model: "gpt-5", scale: 5 },
  };
}

test("buildEvaluationCard produces a compact recipe that references (not embeds) the dataset", () => {
  const card = buildEvaluationCard(recipe(), "2026-07-09T00:00:00.000Z");
  assert.equal(card.bioeval.cardVersion, "1.0");
  assert.equal(card.bioeval.exportedAt, "2026-07-09T00:00:00.000Z");
  assert.deepEqual(card.dataset, {
    id: "ds123",
    name: "HoC",
    task: { id: "mlc", name: "Multi-label classification" },
    classes: ["hallmark-a", "hallmark-b"],
  });
  // dataset carries a reference + the declared label set, but NOT the sample rows
  assert.equal((card.dataset as any).rows, undefined);
  assert.deepEqual((card.dataset as any).classes, ["hallmark-a", "hallmark-b"]);
  assert.equal(card.prompt.template, "Classify: {{input}}");
  assert.equal(card.model.identifier, "gpt-5.4");
  assert.deepEqual(card.evaluation.metrics, ["rougeL", "bertscore"]);
  assert.ok(card.evaluation.parsingFunctions);
  assert.equal((card.evaluation.llmJudge as any).model, "gpt-5");
  assert.equal((card as any).records, undefined);
  assert.equal((card as any).aggregate, undefined);
});

test("buildEvaluationCard nulls optional config when absent", () => {
  const p = recipe();
  p.parsingFunctions = null;
  p.llmJudgeConfig = null;
  const card = buildEvaluationCard(p, "2026-07-09T00:00:00.000Z");
  assert.equal(card.evaluation.parsingFunctions, null);
  assert.equal(card.evaluation.llmJudge, null);
});
