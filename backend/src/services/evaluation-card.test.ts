import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildEvaluationCard,
  EvaluationCardIncompleteError,
  type EvaluationCardPieces,
} from "./evaluation-card";

function completePieces(): EvaluationCardPieces {
  return {
    evaluationId: "eval123",
    inferenceId: "inf123",
    datasetId: "ds123",
    status: "done",
    meta: {
      model: "gpt-5.4",
      provider: { id: "azure", name: "Azure OpenAI" },
      dataset: { id: "ds123", name: "ACI-Bench" },
      task: { id: "generation", name: "Generation" },
      prompt: "Summarize: {{input}}",
      parameters: { max_tokens: 8192 },
      evaluationMetrics: ["rougeL", "bertscore"],
    },
    aggregate: { rougeL: 0.31, bertscore: 0.76 },
    records: [
      { id: "r1", input: "Summarize: hi", reference: "REF", output: "RAW",
        parsed: "PARSED", metrics: [{ key: "rougeL", value: 0.31 }],
        humanScore: null, notes: "" },
    ],
    parsingFunctions: { generation: { code: "def parse(x): return x" } },
    llmJudgeConfig: { model: "gpt-5", scale: 5, reasoningEffort: "medium" },
    datasetClasses: null,
  };
}

test("buildEvaluationCard includes every section for a complete run", () => {
  const card = buildEvaluationCard(completePieces(), "2026-07-09T00:00:00.000Z");
  assert.equal(card.bioeval.cardVersion, "1.0");
  assert.equal(card.bioeval.exportedAt, "2026-07-09T00:00:00.000Z");
  assert.equal(card.evaluation.evaluationId, "eval123");
  assert.equal(card.dataset.name, "ACI-Bench");
  assert.deepEqual(card.dataset.canonicalSchema, ["id", "input", "reference"]);
  assert.equal(card.prompt.template, "Summarize: {{input}}");
  assert.equal(card.model.identifier, "gpt-5.4");
  assert.deepEqual(card.model.parameters, { max_tokens: 8192 });
  assert.ok(card.postprocessing, "postprocessing (parser code) present");
  assert.equal((card.metrics.llmJudge as any).model, "gpt-5");
  assert.deepEqual(card.aggregate, { rougeL: 0.31, bertscore: 0.76 });
  assert.equal(card.records.length, 1);
  assert.equal(card.records[0].output, "RAW");
  assert.equal(card.records[0].parsed, "PARSED");
});

test("buildEvaluationCard nulls optional config when absent", () => {
  const pieces = completePieces();
  pieces.parsingFunctions = null;
  pieces.llmJudgeConfig = null;
  const card = buildEvaluationCard(pieces, "2026-07-09T00:00:00.000Z");
  assert.equal(card.postprocessing, null);
  assert.equal(card.metrics.llmJudge, null);
});

test("buildEvaluationCard throws when the run is not complete", () => {
  const pieces = completePieces();
  pieces.status = "processing";
  assert.throws(
    () => buildEvaluationCard(pieces, "2026-07-09T00:00:00.000Z"),
    EvaluationCardIncompleteError
  );
});
