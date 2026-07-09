# Evaluation card — compact recipe, rendered preview, list-level access — design

- **Date:** 2026-07-09
- **Status:** Approved (design); pending implementation plan
- **Branch:** `feat/evaluation-card-render`
- **Supersedes:** the initial recipe export (merged at `da9e848`), which embedded the full dataset rows, gated on a completed run, and lived only on the deep single-evaluation page. This revision changes those three decisions.

## 1. Motivation

The first recipe export had three problems, seen once we looked at a real exported file:

1. **It embedded every dataset row.** A card of a classification benchmark (e.g. HoC) carried thousands of full-text documents — that is the dataset, not a card. A card should be a compact **recipe**.
2. **It required the run to be `done` (409 otherwise).** But a recipe is configuration; it exists the moment an evaluation is created, before it runs.
3. **It was buried** on the deepest single-evaluation results page, and offered only a raw JSON download — the user could not see what the card contained.

This revision makes the card a **compact recipe that references its dataset**, **exportable/viewable at any run status**, **reachable from the evaluations list**, and **rendered as a readable preview** (with a JSON download).

## 2. Goals / Non-goals

### Goals
- Card = a compact recipe: dataset **reference** (id, name, task) + prompt template + model (provider, identifier, decoding parameters) + evaluation config (metrics, postprocessing, LLM-judge). No dataset rows, no results.
- The `/card` endpoint is available for any existing evaluation regardless of run status (404 only when not found / not owned).
- A **rendered preview** dialog shows the card's sections readably, with a "Download JSON" button.
- The preview opens from the **evaluations list** row actions (one level up from the deep results page), not only from inside a single evaluation's dataview.

### Non-goals (deferred / YAGNI)
- **Import + run** a card — separate follow-on spec (entry point: dashboard `InferenceList` toolbar / `EvaluationsList` toolbar).
- Cross-deployment portability of **custom** datasets: a referenced custom dataset must be carried/uploaded separately (built-in benchmarks are seeded in every deployment, so a referenced card for them is directly runnable). This is an accepted consequence of "reference, not embed".
- Multi-model recipe; results changes (the separate `/results` export is unchanged).

## 3. Card JSON schema (compact, reference dataset)

```jsonc
{
  "bioeval": { "cardVersion": "1.0", "exportedAt": "<ISO-8601>" },
  "dataset": { "id": "…", "name": "…", "task": { "id": "…", "name": "…" } },
  "prompt": { "template": "… {{input}} …" },
  "model": {
    "provider": "azure",           // providerId (catalog key), NOT a credential
    "identifier": "gpt-5.4",
    "parameters": [ { "id": "…", "value": "…" } ]
  },
  "evaluation": {
    "metrics": ["rougeL", "bertscore"],
    "parsingFunctions": [ /* incl. per-task parser code */ ],
    "llmJudgeConfig": { /* judge model, rubric, scale */ }   // or null
  }
}
```

Changed from the initial version: `dataset` is now `{id, name, task}` (a reference); `dataset.rows`, `dataset.defaultPrompt`, and `dataset.classes` are removed. No results, no secrets.

## 4. Architecture

**Backend (revise the existing recipe path):**
- `assembleEvaluationCardRecipe(evaluationId, userId)` (in `routes/evaluation.ts`): drop the `S3Connection`/DuckDB read of dataset rows entirely — the recipe now comes purely from `getEvaluationObject` fields (`datasetId`, `datasetName`, `taskId`, `taskName`, `prompt`, `providerId`, `modelName`, `parameters`, `metrics`, `parsingFunctions`, `llmJudgeConfig`). Return `{status: "not-found"}` only when the evaluation is missing; otherwise `{status: "ok", pieces}` — **no `not-ready`/409** (a recipe is valid at any status).
- The pure builder `buildEvaluationCard` (in `services/evaluation-card.ts`): drop the completeness (`status`) throw; shape the compact recipe with the `{id,name,task}` dataset reference. Update its unit tests.
- `/card` route: drop the 409 branch (keep 404). Same auth + ownership + `Content-Disposition` download.
- `getEvaluationObject`: the now-unused `datasetDefaultPrompt` field may remain (harmless) or be reverted; the recipe no longer reads it. (Plan will revert it to keep the query minimal.)

**Frontend (render + relocate):**
- New component `EvaluationCardDialog` (a shadcn `Dialog`) that, given an `evaluationId`, fetches `GET api/evaluation/card` and renders the recipe in sections:
  - **Dataset:** name · task name.
  - **Prompt:** the template in a monospace block.
  - **Model:** provider + identifier; parameters as a small key/value list.
  - **Evaluation:** metrics as chips; parsing-function name(s); LLM-judge (model · scale) when present.
  - Footer: **Download JSON** button (the existing blob-download of the fetched card).
  - Error/loading states; on fetch error, a `sonner` toast.
- Trigger: add an **"Evaluation card"** item to the evaluation row actions menu in `DataTableRowActions` (`type === "evaluation"`, beside "Delete"), used by `EvaluationsList`. Opening it mounts/opens `EvaluationCardDialog` for that `evaluationId`. Available regardless of run status.
- **Remove** the "Export evaluation card" button from the deep `evaluation-dataview.tsx` (keep "Export results" there). The results page keeps results; the card lives at the list level.

## 5. Endpoint contract (revised)

| | Card (recipe) |
|---|---|
| Method / path | `GET /api/evaluation/card` (query `evaluationId`) |
| Auth / ownership | required, `evaluation.userId === req.user.id` |
| 200 | recipe JSON + `Content-Disposition: attachment; filename="evaluation-card-<id>.json"` |
| 404 | evaluation not found / not owned |
| (no 409) | a recipe is exportable at any run status |

`/results` and `/dataview` are unchanged.

## 6. Rendering layout (reference)

```
Evaluation card
  Dataset     HoC · Multi-label classification
  Prompt      [ mono block of the template, showing {{input}} ]
  Model       gpt-5.4  (azure)
              max_tokens = 8192 · reasoning_effort = medium
  Evaluation  metrics:  ROUGE-L  BERTScore  …          (chips)
              parsing:  section-parser
              LLM judge: gpt-5 · scale 1–5
                                             [ Download JSON ]
```

## 7. Error handling / testing

- Backend: 404 not-found/not-owned; assembly errors → 500. Pure `buildEvaluationCard` is TDD-unit-tested for the compact recipe shape (dataset reference, no rows, no results) and for null-config handling; the no-longer-throwing-on-incomplete behavior is covered by a test that builds a card for a non-`done` status.
- Frontend: the dialog renders each section from the fetched JSON; a fetch failure surfaces a toast. Verified by build + a live smoke (open the dialog from the evaluations list, confirm the rendered sections match the JSON and Download works), since there is no frontend test harness.

## 8. Manuscript

No new paper claims here (still no import/run). The §11 wording already distinguishes evaluation card (configuration/recipe) from results; the compact-reference change does not alter those sentences.

## 9. Follow-on spec (out of scope)

"Import evaluation card + run" (dashboard entry point): parse a card → resolve the referenced dataset (must exist in the deployment, or the user uploads it) → `POST inference/create` → `POST evaluation/create`, handling the missing-provider-integration (422) and unavailable-model cases.
