import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildEvaluationCard,
  EvaluationCardIncompleteError,
  type EvaluationCardRecipePieces,
} from "./evaluation-card";

function completeRecipe(): EvaluationCardRecipePieces {
  return {
    status: "done",
    task: { id: "generation", name: "Generation" },
    dataset: {
      name: "ACI-Bench",
      defaultPrompt: "Summarize: {{input}}",
      classes: null,
      rows: [
        { id: "r1", input: "raw dialogue", reference: "REF" },
        { id: "r2", input: "raw dialogue 2", reference: "REF2" },
      ],
    },
    prompt: "Summarize: {{input}}",
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

test("buildEvaluationCard produces a config-only recipe with embedded dataset rows", () => {
  const card = buildEvaluationCard(completeRecipe(), "2026-07-09T00:00:00.000Z");
  assert.equal(card.bioeval.cardVersion, "1.0");
  assert.equal(card.bioeval.exportedAt, "2026-07-09T00:00:00.000Z");
  assert.deepEqual(card.task, { id: "generation", name: "Generation" });
  assert.equal(card.dataset.name, "ACI-Bench");
  assert.equal(card.dataset.defaultPrompt, "Summarize: {{input}}");
  assert.equal(card.dataset.rows.length, 2);
  assert.equal(card.dataset.rows[0].input, "raw dialogue");
  assert.equal(card.prompt.template, "Summarize: {{input}}");
  assert.equal(card.model.provider, "azure");
  assert.equal(card.model.identifier, "gpt-5.4");
  assert.deepEqual(card.evaluation.metrics, ["rougeL", "bertscore"]);
  assert.ok(card.evaluation.parsingFunctions);
  assert.equal((card.evaluation.llmJudge as any).model, "gpt-5");
  assert.equal((card as any).records, undefined);
  assert.equal((card as any).aggregate, undefined);
});

test("buildEvaluationCard nulls optional config when absent", () => {
  const p = completeRecipe();
  p.parsingFunctions = null;
  p.llmJudgeConfig = null;
  p.dataset.classes = null;
  const card = buildEvaluationCard(p, "2026-07-09T00:00:00.000Z");
  assert.equal(card.evaluation.parsingFunctions, null);
  assert.equal(card.evaluation.llmJudge, null);
  assert.equal(card.dataset.classes, null);
});

test("buildEvaluationCard throws when the run is not complete", () => {
  const p = completeRecipe();
  p.status = "processing";
  assert.throws(
    () => buildEvaluationCard(p, "2026-07-09T00:00:00.000Z"),
    EvaluationCardIncompleteError
  );
});
