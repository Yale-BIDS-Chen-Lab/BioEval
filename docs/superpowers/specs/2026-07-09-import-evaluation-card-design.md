# Import evaluation card and run — design

- **Date:** 2026-07-09
- **Status:** Approved (design); pending implementation plan
- **Branch:** `feat/import-evaluation-card`
- **Predecessor:** the export/render work (evaluation card = compact reproducible recipe), merged on `main`. That spec listed "import + run" as the follow-on; this is it.

## 1. Motivation

An evaluation card captures everything needed to re-run an evaluation: the dataset reference, prompt template, model + decoding parameters, and evaluation configuration (metrics, postprocessing, LLM-judge). Exporting it makes a run reproducible on paper; importing it makes reproduction one action. A user can take a card JSON (their own or a colleague's) and, in one step, recreate the same inference + evaluation and run it.

## 2. Goals / Non-goals

### Goals
- A dashboard entry point to import a card JSON and immediately create + run the inference and its evaluation, exactly as the card specifies (no editing).
- Resolve the card's dataset **by name + task**: built-in datasets always match; a non-built-in dataset matches when the user has already uploaded a dataset with the same name and task.
- Preview the parsed card before committing, reusing the existing card render.
- Clear, actionable errors for the failure cases (dataset not found, missing provider integration, malformed card).

### Non-goals (out of scope)
- **Editing before running.** Import is one-click, card-as-is. (Adjusting model/prompt/project → use the normal New-inference flow.)
- **Auto-uploading a custom dataset from the card.** The card references, not embeds, the dataset (a deliberate earlier decision); a custom dataset must already exist in the user's deployment under the same name + task.
- **Multi-model cards.** One card = one model = one inference. (A comparison is reproduced by importing two cards.)
- **A backend atomic import endpoint.** We orchestrate the existing endpoints from the frontend (see §4); a transactional server endpoint is deliberately deferred.
- Bringing an API key / provider integration along with the card (never in the card; the importing user configures their own integration).

## 3. Key decisions (from brainstorming)

1. **Interaction:** one-click, run card as-is (upload/paste → preview → confirm → create + run).
2. **Dataset resolution:** match on **name AND task id**. Same name but different task → not a match.
3. **Architecture:** **frontend orchestration** of the existing endpoints — no backend changes. Accepted trade-off: not atomic (if `evaluation/create` fails after `inference/create` succeeds, a bare inference remains; the user is told and can delete it or add the evaluation manually).
4. **Entry point:** the dashboard `InferenceList` toolbar, beside "New inference".

## 4. Architecture and data flow

New component `ImportCardDialog` (frontend), opened from the `InferenceList` toolbar. No backend changes — it orchestrates three existing endpoints.

Flow:
1. **Provide card** — upload a `.json` file or paste JSON text.
2. **Parse + validate structure** — the JSON must have `bioeval`, `dataset.{name, task.id}`, `prompt.template`, `model.{identifier, provider, parameters}`, and `evaluation.metrics` (non-empty). On failure, show an inline error and stop.
3. **Preview** — render the parsed card with the existing `CardBody` (from `evaluation-card-dialog.tsx`) so the user sees exactly what will run.
4. **Dataset pre-check** — `GET api/dataset/list`, find a dataset where `name === card.dataset.name && taskId === card.dataset.task.id`.
   - Found → show "Will use your dataset **{name}** ({task})"; enable "Import & run".
   - Not found → show "No dataset named **{name}** ({task}) found — upload it first", keep "Import & run" disabled.
5. **Import & run** — on click:
   - `POST api/inference/create` with the mapped body → `inferenceId`;
   - `POST api/evaluation/create` with the mapped body → `evaluationId`;
   - success → toast, invalidate the `["inferences", projectId]` query (the new run appears and starts), close the dialog.

`projectId` comes from the dashboard route (`/_authed/dashboard/project/$projectId/`), same as `InferenceList` already uses.

## 5. Card → request mapping

Pure functions (kept separate for clarity and review):

**`matchDataset(card, datasets)`** → the dataset with `name === card.dataset.name && taskId === card.dataset.task.id`, or `null`.

**`buildInferenceBody(card, datasetId, projectId)`**:
```jsonc
{
  "datasetId": "<matched>",
  "prompt": card.prompt.template,
  "projectId": "<current>",
  "models": [
    { "model": card.model.identifier,
      "provider": card.model.provider,
      "parameters": card.model.parameters }   // [{id, value}], as-is
  ]
}
```
(`taskId` is derived server-side from the dataset, so it is not sent.)

**`buildEvaluationBody(card, inferenceId, projectId)`**:
```jsonc
{
  "inferenceId": "<from inference/create>",
  "projectId": "<current>",
  "metrics": card.evaluation.metrics,                    // non-empty
  "parsingFunctions": card.evaluation.parsingFunctions ?? [],
  "llmJudgeConfig": card.evaluation.llmJudge ?? {}       // note: card field is `llmJudge`; endpoint field is `llmJudgeConfig`
}
```

These map exactly onto `createInferenceSchema` (`datasetId, prompt, models:[{model, provider, parameters}], projectId`) and `createEvaluationSchema` (`inferenceId, metrics, projectId, parsingFunctions, llmJudgeConfig?`).

## 6. Error handling

- **Malformed JSON / missing required fields** → inline error in the dialog ("This file is not a valid evaluation card"); nothing is created.
- **Dataset not found (name + task)** → inline message guiding the user to upload a dataset with that name + task; "Import & run" stays disabled.
- **`inference/create` fails** — surface the endpoint's error verbatim, with special-casing for the common one:
  - `422` missing provider integration → "No integration configured for provider **{provider}** — set it up in Settings, then import again."
  - other (model doesn't exist, invalid parameter) → show the returned `error`.
  - Nothing further is created.
- **`evaluation/create` fails after `inference/create` succeeded** → "The inference was created, but its evaluation failed: *{error}*. You can add the evaluation from the dashboard, or delete the inference." (the non-atomic trade-off, made explicit to the user).
- **Success** → toast "Imported — the run is starting", refresh, close.

## 7. Components / files

- **New** `frontend/src/components/evaluation/import-card-dialog.tsx` — the dialog (file/paste input, parse+validate, `CardBody` preview, dataset pre-check, the two create calls, error/success states) plus the three pure helpers (`matchDataset`, `buildInferenceBody`, `buildEvaluationBody`) — colocated or in a small sibling `import-card.ts` if that reads cleaner.
- **Modify** `frontend/src/components/project/inference-list.tsx` — add an "Import card" button to the `DataTable` toolbar children (beside "New inference").
- **Reuse** `CardBody` (export already exists from the render work), `axios`, `sonner`, `useQueryClient`.
- **No backend changes.**

## 8. Testing

No frontend test harness, so verification is: production build + a live smoke. The three pure helpers are written to be trivially inspectable (and unit-testable if a harness is added later). Smoke: import the NCBI Disease example card → built-in dataset matches on name+task → an inference + evaluation are created and start running, appearing on the dashboard; then a negative smoke: a card whose dataset name is not present → the dialog blocks with the upload guidance.

## 9. Manuscript

Once import + run ships, §11's wording can be strengthened: the evaluation card is now not only exportable but importable and directly runnable (the earlier spec deferred that claim until import landed). This is a follow-up edit to `paper.md`, not part of the implementation.

## 10. Follow-on (not now)

- Backend atomic import endpoint (transactional create) if the non-atomic residue proves annoying.
- Guided custom-dataset upload from within the import flow.
- Importing a whole comparison (multiple cards at once).
