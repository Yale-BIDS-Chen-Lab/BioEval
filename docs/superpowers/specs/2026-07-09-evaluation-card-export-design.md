# Evaluation Card export — design

- **Date:** 2026-07-09
- **Status:** Approved (design); pending implementation plan
- **Scope:** Export one completed evaluation run as a single, self-contained, machine-readable "evaluation card" file.

## 1. Motivation

The manuscript frames a machine-readable **evaluation card** as the reproducibility unit for medical LLM benchmarking, claiming each run is "recorded as a machine-readable evaluation card" that can be "inspected, audited, or re-scored" and is "exportable from the interface."

A code audit found this is **not yet true as a single artifact**:

- The term "evaluation card" appears only in the manuscript — there is no such object in `backend/`, `frontend/`, `inference-service/`, or the UI.
- A run's provenance is scattered across ~5 DB tables (`evaluation`, `inference`, `dataset`, `provider`, `task`) + a per-example Parquet file in object storage + annotation side-tables (`humanScore`, `note`, `highlight`), and is only live-assembled at query time by `/api/evaluation/dataview`.
- The only interface export is a client-side `export.json` that dumps the **per-example records array only** — it omits the run configuration (prompt template, decoding parameters, model/provider, metric configuration, postprocessing code) and the aggregate scores.

What *is* already true and should be preserved: inference and evaluation are decoupled (separate RabbitMQ queues), so a run can be **re-scored** (postprocessing + metrics recomputed on stored outputs) without re-running model inference.

This spec makes the "single exportable evaluation card" claim literally true by adding an endpoint that assembles one run's complete configuration + outputs + scores + annotations into one downloadable JSON.

## 2. Goals / Non-goals

### Goals
- A backend endpoint that returns **one completed evaluation run** as a single JSON "evaluation card."
- The card bundles everything needed to inspect/audit/reproduce the result: dataset+task identity, prompt template, model + decoding parameters, postprocessing configuration **including its code**, metric configuration (including LLM-judge settings), aggregate scores, and all per-example records (rendered prompt, reference, raw output, postprocessed output, per-example scores, human ratings, notes).
- Reusable by GUI, API, and future CLI/automation (server-side assembly, not browser-only).
- Make "evaluation card" a real term in code and UI.

### Non-goals (YAGNI / deferred)
- **Import + re-run** (reconstitute a card and re-score / re-infer) — deferred to a **separate follow-on spec**. This spec only designs the card so it is round-trippable (see §11).
- **Materialising/persisting** the card at evaluation-completion time — the card is assembled on request; no schema change, no write path, always reflects the latest annotations.
- **A comparison/pairwise-statistics export** (two runs + bootstrap CIs + Wilcoxon). The pairwise statistics are a property of a *comparison*, reproducible from two cards + the fixed test procedure.
- **Parquet download from the interface** — the card is a single JSON. Parquet remains internal storage only.
- API keys / model weights are **never** included in the card.

## 3. Architecture

- **New endpoint:** `GET /api/evaluation/:evaluationId/card`, authenticated, with the same ownership check as `/api/evaluation/dataview` (must match `evaluation.userId === req.user.id`).
- **Shared assembler:** extract the run-assembly logic (currently inline in the `dataview` route in `backend/src/routes/evaluation.ts`) into a reusable function `assembleEvaluationCard(evaluationId, userId)`. Both the `dataview` route and the new `card` endpoint call it, so there is one source of truth and no duplicated DuckDB/merge logic.
- **Live assembly (on request), no schema change:**
  1. `getEvaluationObject(evaluationId, userId)` in `backend/src/db/queries/evaluation.ts` — **extended** to also select `evaluation.parsingFunctions` and `evaluation.llmJudgeConfig` (currently omitted).
  2. Read the per-example results (and aggregate) Parquet via the existing `S3Connection`/DuckDB path (dataset ⋈ inference ⋈ evaluation).
  3. Merge human scores (`getHumanScores`) and notes (`getNotes`).
  4. Serialise into the card JSON (§4) and return with a download header.
- **Response header:** `Content-Type: application/json`; `Content-Disposition: attachment; filename="evaluation-card-<evaluationId>.json"`.

## 4. Card JSON schema

A self-contained, machine-readable, round-trippable document:

```jsonc
{
  "bioeval": { "cardVersion": "1.0", "exportedAt": "<ISO-8601>" },
  "evaluation": {
    "evaluationId": "…", "inferenceId": "…", "datasetId": "…",
    "createdAt": "<ISO-8601>", "status": "done"
  },
  "dataset": {
    "id": "…", "name": "…",
    "task": { "id": "…", "name": "…" },
    "canonicalSchema": ["id", "input", "reference"],
    "classes": ["…"]        // NER / multi-label label set, else null
  },
  "prompt": { "template": "… {{input}} …" },
  "model": {
    "provider": { "id": "…", "name": "…" },
    "identifier": "…",
    "parameters": { /* InferenceArguments: decoding params */ }
  },
  "postprocessing": { /* parsingFunctions incl. per-task parser code */ } /* or null */,
  "metrics": {
    "list": ["rougeL", "bertscore", "…"],
    "llmJudge": { /* llmJudgeConfig: judge model, rubric, scale */ } /* or null */
  },
  "aggregate": { "rougeL": 0.31, "bertscore": 0.76, "…": 0.0 },
  "records": [
    {
      "id": "…",
      "input": "…",            // fully rendered prompt (template with {{input}} substituted)
      "reference": "…",        // gold
      "output": "…",           // raw model output
      "parsed": "…",           // postprocessed prediction
      "parsedVector": null,
      "referenceVector": null,
      "metrics": [ { "key": "rougeL", "value": 0.31 }, … ],
      "humanScore": null,
      "notes": ""
    }
  ]
}
```

Notes:
- `records[].output` (raw) and `records[].parsed` (postprocessed) are **embedded**, so the card carries the model outputs. This is what makes a future "import + re-score" self-contained (no access to the originating deployment needed).
- `cardVersion` allows the future import path to validate/upgrade.
- The **source→canonical column mapping is intentionally absent** — it is not persisted by the app (mapping happens in-browser at upload and is discarded), so the card records the canonical schema, not the original column names.

## 5. Endpoint contract

| | |
|---|---|
| Method / path | `GET /api/evaluation/:evaluationId/card` |
| Auth | Required; `evaluation.userId === req.user.id` |
| 200 | Card JSON (§4) + `Content-Disposition: attachment` |
| 404 | Evaluation not found or not owned by the user |
| 409 | Evaluation not complete (`status !== "done"` or missing `objectKey`s) — a card cannot be exported for an incomplete run |
| 500 | Object-storage / DuckDB assembly failure |

## 6. Frontend

- On the evaluation results page (`frontend/src/routes/_authed/dashboard/project/$projectId/inference/$inferenceId/evaluation/$evaluationId.tsx`), replace the current records-only "export" control with an **"Export evaluation card"** button that requests the new endpoint and triggers the browser download.
- The inference-page records-only export (`inference-dataview.tsx`) is out of scope for this spec (may be revisited later); this spec does not change it.

## 7. Naming

Use "evaluation card" consistently so the manuscript term is real in the product:
- Endpoint path segment: `/card`
- Downloaded filename: `evaluation-card-<evaluationId>.json`
- UI button label: **Export evaluation card**

## 8. Error handling

Mirror the `dataview` route's guards: not-found / not-owned → 404; not `done` or missing object keys → 409 with a clear message; assembly errors → 500. No partial-card exports.

## 9. Testing

Backend tests (existing Docker-based backend test harness, no host network):
- **Happy path:** for a completed evaluation, `GET /card` returns 200 with `Content-Disposition: attachment; filename="evaluation-card-<id>.json"`, and the parsed body contains all sections — specifically asserting the fields that the old export omitted: `postprocessing` (with code), `metrics.llmJudge` (when the run used an LLM judge), `model.parameters`, `prompt.template`, `aggregate`, and `records[]` each with `input` (rendered), `output` (raw), `parsed`, and `metrics`.
- **Ownership:** a different user's evaluationId → 404.
- **Incomplete:** an evaluation with `status !== "done"` → 409.
- **Assembler unit:** `assembleEvaluationCard` returns the same `{meta, aggregate, records}` content that `dataview` returns today (regression guard on the refactor) plus the two newly-added config fields.

## 10. Future work (separate spec): Import + re-run

A follow-on spec will let a user **import** a card and run it:
- **Re-score (self-contained):** reconstitute an inference artifact from the card's embedded outputs, then run the existing (decoupled) evaluation pipeline to recompute postprocessing + metrics — no model or API key required.
- **Re-generate (environment-dependent):** re-run model inference; requires the importing deployment to have the provider integration/key configured and the model available.

This spec's card schema (embedded outputs + `cardVersion`) is designed to make that follow-on possible.

## 11. Manuscript reconciliation (after implementation)

Once shipped, the following manuscript claims become defensible and should be re-checked/adjusted:
- "machine-readable evaluation card" / "exportable" → **true** (single JSON via the interface/API).
- "download a single configuration file" → **true** (the card is that file).
- "(JSON **and Parquet**) exported from the interface" → adjust: the **card is JSON**; Parquet remains internal storage. Wording should say the card is a JSON export (outputs are also stored as Parquet internally).
- "re-scored without re-running inference" → already true; unchanged.
