# Evaluation card (recipe) export + rename results — design

- **Date:** 2026-07-09
- **Status:** Approved (design); pending implementation plan
- **Branch:** `feat/evaluation-card-recipe`
- **Predecessor:** builds on the merged "evaluation card export" work (commit `c6337b8`), which added a per-run export of config **and** results.

## 1. Motivation

The first iteration exported one bundle ("evaluation card") that mixed two conceptually different things:

- the **recipe** — the parameters needed to *run* an evaluation (dataset, prompt, model + decoding parameters, postprocessing, metric config); and
- the **results** — the *outcome* of a run (raw outputs, postprocessed predictions, per-example scores, aggregate scores, annotations).

These should be separated. A **recipe** is a reusable, importable object: import it and you can immediately re-run inference + evaluation. **Results** are output data you keep for the record. Conflating them means the "card" is not actually runnable and its name overpromises.

This spec:
1. **Renames** the existing config+results export to **"results"** (it is results + context, not a runnable recipe), and
2. Adds a new, config-only **"evaluation card" = recipe** export that embeds the dataset so it can (in a follow-on spec) be imported and run.

## 2. Goals / Non-goals

### Goals
- Rename the existing per-run export end to end (endpoint, service, types, filename, button label) from "evaluation card" to "results".
- Add a new recipe export: `GET /api/evaluation/card` returning a config-only, self-contained JSON that embeds the dataset rows, the prompt template, the model + decoding parameters, and the evaluation configuration (metrics, postprocessing, LLM-judge).
- The recipe format is designed to be reconstituted by a follow-on "import + run" spec (dataset re-upload → create inference → create evaluation).
- Two independent export endpoints, each with a pure builder and focused service file.

### Non-goals (deferred / YAGNI)
- **Import + run** (reconstitute a recipe and execute it) — a **separate follow-on spec**. This spec only *produces* the recipe.
- **Multi-model recipe** — one evaluation = one inference = one model; a recipe carries a single model. (A comparison is reproduced by importing two recipes.)
- **A "reference dataset instead of embed" option** — the recipe always embeds rows (decision: portability > size).
- API keys / model weights are **never** in the recipe (they are the importing deployment's responsibility: a per-user provider integration in the `config` table, and model availability on the worker).

## 3. Ground truth (from a code audit of the run flows)

To reconstitute + run later, a recipe must supply what the three "create" endpoints need:
- **Dataset:** creation is multipart-only (`PUT /api/dataset/upload-custom`); rows are `{id, input_raw, reference}` and it also needs `name`, `taskId`, `description`, `defaultPrompt` (must contain `{{input}}`), and `classes` (required for `ner`/`mlc`). There is **no JSON-only dataset create endpoint**. → the recipe embeds the raw rows + this metadata so import can rebuild the dataset.
- **Inference:** `POST /api/inference/create` needs `{datasetId, prompt, projectId, models:[{model, provider, parameters}]}`; `taskId` is derived from the dataset. It 422s unless the importing user has a provider `config` (API key) for that provider.
- **Evaluation:** `POST /api/evaluation/create` needs `{inferenceId, projectId, metrics, parsingFunctions, llmJudgeConfig}`.

These constraints justify: embed the dataset (rows + metadata), carry `provider`+`model`+`parameters` but **not** keys, and carry the full evaluation config.

## 4. Architecture

Two parallel, independent export paths sharing the existing `getEvaluationObject` query and `S3Connection` DuckDB access.

**Rename (results):**
- Route `GET /api/evaluation/card` → `GET /api/evaluation/results`.
- Service `backend/src/services/evaluation-card.ts` → `evaluation-results.ts`; `buildEvaluationCard` → `buildEvaluationResults`; `EvaluationCard` → `EvaluationResults`; `EvaluationCardIncompleteError` → `EvaluationResultsIncompleteError`. (`EvaluationCardPieces`, the assembled I/O shape shared with `/dataview`, is renamed `RunPieces` for neutrality.)
- The shared assembler `assembleEvaluationCard` in `routes/evaluation.ts` → `assembleRunData` (still used by `/dataview` and `/results`).
- Downloaded filename `evaluation-card-<id>.json` → `evaluation-results-<id>.json`; top-level `bioeval.cardVersion` → `bioeval.resultsVersion`.
- Frontend button "Export evaluation card" → "Export results".

**New recipe (evaluation card):**
- New route `GET /api/evaluation/card` (the name "card" now means recipe). Same auth + ownership + not-found(404)/not-ready(409) contract.
- New service `backend/src/services/evaluation-card.ts` exporting a **pure** `buildEvaluationCard(recipePieces, exportedAt)` (recipe shape) + `EvaluationCardIncompleteError`.
- New assembler `assembleEvaluationCardRecipe(evaluationId, userId)` in `routes/evaluation.ts`: `getEvaluationObject` (prompt template, model, providerId, parameters, metrics, parsingFunctions, llmJudgeConfig, dataset name/task/classes, dataset objectKey, **defaultPrompt** — add to the select) + a DuckDB `SELECT id, input, reference FROM dataset` over the dataset objectKey to embed the raw rows. Returns 404/409/ok like the results path.
- Frontend: a second button "Export evaluation card" on the evaluation results page, next to "Export results".

## 5. Recipe JSON schema

```jsonc
{
  "bioeval": { "cardVersion": "1.0", "exportedAt": "<ISO-8601>" },
  "task": { "id": "…", "name": "…" },
  "dataset": {
    "name": "…",
    "defaultPrompt": "… {{input}} …",
    "classes": ["…"],                 // NER/MLC label set, else null
    "rows": [ { "id": "…", "input": "…", "reference": "…" } ]  // raw dataset rows (pre-prompt-render)
  },
  "prompt": { "template": "… {{input}} …" },   // the actual prompt used for this run (inference.prompt)
  "model": {
    "provider": "azure",              // providerId (global catalog key), NOT a credential
    "identifier": "gpt-5.4",
    "parameters": [ { "id": "…", "value": "…" } ]   // decoding params (InferenceArguments)
  },
  "evaluation": {
    "metrics": ["rougeL", "bertscore"],
    "parsingFunctions": [ /* incl. per-task parser code */ ],
    "llmJudgeConfig": { /* judge model, rubric, scale */ }   // or null
  }
}
```

Notes:
- `dataset.rows[].input` is the **raw** dataset input (pre-render), which is what re-running inference needs (the template is applied at inference time). This is distinct from the *results* export, whose `records[].input` is the rendered prompt.
- No results, no scores, no API keys.

## 6. Endpoint contracts

| | Results (renamed) | Recipe (new) |
|---|---|---|
| Method / path | `GET /api/evaluation/results` | `GET /api/evaluation/card` |
| Auth / ownership | required, `evaluation.userId === req.user.id` | same |
| 200 | results JSON + `Content-Disposition: attachment; filename="evaluation-results-<id>.json"` | recipe JSON + `filename="evaluation-card-<id>.json"` |
| 404 | evaluation not found / not owned | same |
| 409 | evaluation not complete | same |

## 7. Error handling

Mirror the existing pattern: not-found/not-owned → 404; not `done` / missing object keys → 409; assembly failure → 500. Frontend download functions wrap in try/catch and surface a `sonner` toast on failure (as the current results button already does).

## 8. Testing

- **Pure builders (TDD, unit):** `buildEvaluationResults` (rename of existing tests) and `buildEvaluationCard` (new) — assert the recipe contains task, dataset (with embedded rows + defaultPrompt + classes), prompt template, model (provider/identifier/parameters), and evaluation config (metrics/parsingFunctions/llmJudgeConfig); and that it throws on an incomplete run. Run via the `docker-files-migrate:latest` image (`npm test`).
- **I/O endpoints:** verified by real prod build + a live smoke against the running stack (the recipe assembler is reviewed for fidelity; a done evaluation's `/card` returns a well-formed recipe whose `dataset.rows` count matches the dataset).

## 9. Manuscript reconciliation (after implementation, careful wording)

After the rename + recipe export land, terminology in the paper must be corrected:
- "evaluation card" now = the **recipe** (a reproducibility unit that captures everything needed to re-run). The exportable-single-file claim holds for the recipe.
- The **results** export is a separate convenience; the "inspect/audit/re-score without re-running inference" property belongs to results (the outputs are present).
- **Do NOT yet claim "import a card and re-run"** — that ships in the follow-on import spec. This spec only supports *exporting* the recipe. Word §11 accordingly (exportable recipe now; importable/runnable when the import spec lands).

## 10. Follow-on spec (out of scope here)

"Import evaluation card + run": parse a recipe → rebuild the dataset (multipart upload from embedded rows) → `POST inference/create` → `POST evaluation/create`, with clear handling when the user lacks the provider integration (the 422 case) or the model is unavailable.

**Entry point (user preference):** the import lives on the **dashboard** (the "My Inferences" / benchmark dashboard page that lists runs) — an "Import evaluation card" button that opens the reconstitute-and-run flow; the resulting run then appears in that same dashboard.
