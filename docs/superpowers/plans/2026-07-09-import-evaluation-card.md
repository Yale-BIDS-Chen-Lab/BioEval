# Import Evaluation Card and Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let a user import an evaluation card JSON on the dashboard and, in one click, recreate its inference + evaluation and run them.

**Architecture:** Pure frontend orchestration — no backend changes. An `ImportCardDialog` parses/validates the card, previews it with the existing `CardBody`, resolves the dataset by name+task via `dataset/list`, then calls `inference/create` and `evaluation/create` in sequence. Card→request mapping lives in small pure functions.

**Tech Stack:** React + TanStack Query + axios + shadcn/ui (Dialog, Button), sonner.

---

## Testing note

The frontend has no unit-test harness, so verification per task is: the file references only existing primitives/exports, and `git diff` is clean. The mapping/validation logic is isolated into pure functions (`import-card.ts`) that are trivially inspectable and unit-testable if a harness is added later. The controller runs ONE production build + a live smoke at the end (build via `docker compose --project-directory docker-files up -d --build frontend`). Do NOT rebuild per task. Branch: `feat/import-evaluation-card`. Stage only the named files (never `.DS_Store` / `manuscripts/`).

**Response shapes (verified against the backend):**
- `POST api/inference/create` success → `{ success: true, message, created: [inferenceId] }` (single model ⇒ `created[0]`). Failures: `404` (project/dataset/provider/model missing), `422` (no provider integration), `400` (bad parameter), `502` (queued-publish failed). The axios instance throws on non-2xx; read `err.response.status` / `err.response.data.error`.
- `POST api/evaluation/create` success → `{ success: true, message }` (NO evaluationId — not needed). Failures: `404` (parsing fn / metric missing, inference/project missing), `400`, `502`.
- `GET api/dataset/list` → `{ success: true, datasets: [{ datasetId, name, taskId, taskName }] }`.

---

## File Structure

- **Create** `frontend/src/components/evaluation/import-card.ts` — types + pure functions: `parseCard`, `matchDataset`, `buildInferenceBody`, `buildEvaluationBody`.
- **Create** `frontend/src/components/evaluation/import-card-dialog.tsx` — the `ImportCardDialog` component.
- **Modify** `frontend/src/components/project/inference-list.tsx` — add an "Import card" toolbar button + mount the dialog.

---

## Task 1: Pure card→request helpers

**Files:** Create `frontend/src/components/evaluation/import-card.ts`

- [ ] **Step 1: Create the file with exactly:**

```ts
export type DatasetListItem = {
  datasetId: string;
  name: string;
  taskId: string;
  taskName: string;
};

export type ImportCard = {
  dataset: { name: string; task: { id: string; name: string } };
  prompt: { template: string };
  model: {
    identifier: string;
    provider: string;
    parameters: { id: string; value: unknown }[];
  };
  evaluation: {
    metrics: string[];
    parsingFunctions?: unknown;
    llmJudge?: unknown;
  };
  [key: string]: unknown;
};

export function parseCard(
  text: string
): { card: ImportCard } | { error: string } {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    return { error: "This is not valid JSON." };
  }
  if (!obj || typeof obj !== "object")
    return { error: "This is not a valid evaluation card." };
  if (!obj.dataset?.name || !obj.dataset?.task?.id)
    return { error: "Card is missing the dataset name or task." };
  if (!obj.prompt?.template)
    return { error: "Card is missing the prompt template." };
  if (!obj.model?.identifier || !obj.model?.provider)
    return { error: "Card is missing the model identifier or provider." };
  if (
    !Array.isArray(obj.evaluation?.metrics) ||
    obj.evaluation.metrics.length === 0
  )
    return { error: "Card has no evaluation metrics." };
  return { card: obj as ImportCard };
}

export function matchDataset(
  card: ImportCard,
  datasets: DatasetListItem[]
): DatasetListItem | null {
  return (
    datasets.find(
      (ds) =>
        ds.name === card.dataset.name && ds.taskId === card.dataset.task.id
    ) ?? null
  );
}

export function buildInferenceBody(
  card: ImportCard,
  datasetId: string,
  projectId: string
) {
  return {
    datasetId,
    prompt: card.prompt.template,
    projectId,
    models: [
      {
        model: card.model.identifier,
        provider: card.model.provider,
        parameters: Array.isArray(card.model.parameters)
          ? card.model.parameters
          : [],
      },
    ],
  };
}

export function buildEvaluationBody(
  card: ImportCard,
  inferenceId: string,
  projectId: string
) {
  return {
    inferenceId,
    projectId,
    metrics: card.evaluation.metrics,
    parsingFunctions: Array.isArray(card.evaluation.parsingFunctions)
      ? card.evaluation.parsingFunctions
      : [],
    llmJudgeConfig:
      card.evaluation.llmJudge && typeof card.evaluation.llmJudge === "object"
        ? card.evaluation.llmJudge
        : {},
  };
}
```

- [ ] **Step 2:** Sanity-check by hand against the example card (`dataset.name="NCBI Disease"`, `task.id="ner"`, `model.identifier="Qwen/Qwen2.5-7B-Instruct"`, `evaluation.metrics=["exact_match_precision",...]`, `parsingFunctions=[]`, `llmJudge=null`): `parseCard` returns `{card}`; `buildEvaluationBody` yields `parsingFunctions: []`, `llmJudgeConfig: {}`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/evaluation/import-card.ts
git commit -m "feat(import): pure card parse + dataset-match + request-body mappers"
```

---

## Task 2: ImportCardDialog

**Files:** Create `frontend/src/components/evaluation/import-card-dialog.tsx`

- [ ] **Step 1: Create the file with exactly:**

```tsx
"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { axios } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardBody } from "./evaluation-card-dialog";
import {
  buildEvaluationBody,
  buildInferenceBody,
  matchDataset,
  parseCard,
  type DatasetListItem,
} from "./import-card";

interface ImportCardDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportCardDialog({
  projectId,
  open,
  onOpenChange,
}: ImportCardDialogProps) {
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const parsed = useMemo(
    () => (rawText.trim() ? parseCard(rawText) : null),
    [rawText]
  );
  const card = parsed && "card" in parsed ? parsed.card : null;

  const { data: datasetsData } = useQuery({
    queryKey: ["datasets"],
    enabled: open,
    queryFn: async () =>
      axios.get("api/dataset/list", { withCredentials: true }),
  });
  const datasets: DatasetListItem[] = datasetsData?.data?.datasets ?? [];
  const matched = card ? matchDataset(card, datasets) : null;

  const reset = () => {
    setRawText("");
    setIsImporting(false);
  };
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then(setRawText)
      .catch(() => toast.error("Could not read the file."));
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!card || !matched) return;
    setIsImporting(true);
    try {
      const infRes = await axios.post(
        "api/inference/create",
        buildInferenceBody(card, matched.datasetId, projectId),
        { withCredentials: true }
      );
      const inferenceId: string | undefined = infRes.data?.created?.[0];
      if (!inferenceId) {
        toast.error("Import failed: no inference was created.");
        return;
      }
      try {
        await axios.post(
          "api/evaluation/create",
          buildEvaluationBody(card, inferenceId, projectId),
          { withCredentials: true }
        );
        toast.success("Imported — the run is starting.");
        queryClient.invalidateQueries({ queryKey: ["inferences", projectId] });
        handleOpenChange(false);
      } catch (evalErr: any) {
        queryClient.invalidateQueries({ queryKey: ["inferences", projectId] });
        toast.error(
          `The inference was created, but its evaluation failed: ${
            evalErr?.response?.data?.error ?? "unknown error"
          }. Add it from the dashboard or delete the inference.`
        );
      }
    } catch (infErr: any) {
      const status = infErr?.response?.status;
      const err = infErr?.response?.data?.error;
      if (status === 422) {
        toast.error(
          `No integration configured for provider "${card.model.provider}" — set it up in Settings, then import again.`
        );
      } else {
        toast.error(err ?? "Failed to create the inference.");
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>Import evaluation card</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Paste or upload a card JSON to recreate its inference + evaluation
            and run it.
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onFile}
              />
              <span className="border-input hover:bg-muted inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm">
                <Upload className="h-4 w-4" /> Upload .json
              </span>
            </label>
            <span className="text-muted-foreground text-xs">or paste below</span>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder='{ "bioeval": { … }, "dataset": { … }, … }'
            className="border-input h-28 w-full rounded-md border p-2 font-mono text-xs"
          />

          {parsed && "error" in parsed && (
            <p className="text-destructive text-sm">{parsed.error}</p>
          )}

          {card && (
            <>
              <div className="rounded-md border p-4">
                <CardBody card={card} />
              </div>
              {matched ? (
                <p className="text-sm">
                  Will use your dataset{" "}
                  <span className="font-medium">{matched.name}</span> (
                  {matched.taskName}).
                </p>
              ) : (
                <p className="text-destructive text-sm">
                  No dataset named "{card.dataset.name}" ({card.dataset.task.name}
                  ) found in your workspace — upload it first, then import again.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!card || !matched || isImporting}
          >
            {isImporting ? "Importing…" : "Import & run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2:** Verify imports resolve: `CardBody` is exported from `./evaluation-card-dialog` (it is); `@/components/ui/{dialog,button}`, `@/lib/axios`, `sonner`, `lucide-react`, `@tanstack/react-query` all exist. `useQueryClient` + `invalidateQueries` usage matches `data-table-row-actions.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/evaluation/import-card-dialog.tsx
git commit -m "feat(import): ImportCardDialog — parse, preview, dataset pre-check, create+run"
```

---

## Task 3: Wire the "Import card" button into the dashboard toolbar

**Files:** Modify `frontend/src/components/project/inference-list.tsx`

Context: `InferenceList` already has `const { projectId } = useParams(...)` and renders a `<DataTable>` whose children are the toolbar buttons ("New inference", "Compare"). It already imports `useState`.

- [ ] **Step 1:** Add the import near the other component imports:
```tsx
import { ImportCardDialog } from "@/components/evaluation/import-card-dialog";
```

- [ ] **Step 2:** Add dialog state next to `selectedRows`:
```tsx
  const [showImport, setShowImport] = useState(false);
```

- [ ] **Step 3:** Add an "Import card" button as the FIRST child of `<DataTable>` (before the "New inference" button), matching the existing button styling:
```tsx
        <Button
          className="h-10 cursor-pointer px-4 text-base font-semibold tracking-tight"
          variant={"outline"}
          onClick={() => setShowImport(true)}
        >
          Import card
        </Button>
```

- [ ] **Step 4:** Mount the dialog. Wrap the returned root so the dialog is a sibling of the existing top-level `<div className="space-y-6">` (or place `<ImportCardDialog … />` just inside that div, after `<OverallModelRanking />`'s sibling `<DataTable>`). Concretely, add right before the closing `</div>` of the `min-w-0 space-y-6` container:
```tsx
      <ImportCardDialog
        projectId={projectId}
        open={showImport}
        onOpenChange={setShowImport}
      />
```

- [ ] **Step 5:** Verify with `git diff`: one import, one state line, one toolbar button, one dialog mount — nothing else changed.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/project/inference-list.tsx
git commit -m "feat(import): Import card button on the dashboard toolbar"
```

---

## Final verification (controller, after all tasks)

- One rebuild: `docker compose --project-directory docker-files up -d --build frontend`; confirm the container is healthy.
- **Positive smoke:** dashboard → "Import card" → paste/upload the NCBI Disease example card → the preview renders, dataset shows "Will use your dataset NCBI Disease (Named-entity Recognition)", click "Import & run" → toast, dialog closes, a new inference appears in the list and starts; its evaluation is created and runs.
- **Negative smoke:** a card whose `dataset.name` isn't in the workspace → the dialog shows the "upload it first" message and "Import & run" stays disabled. A malformed JSON → inline "not valid JSON" error.
- (Optional) provider-key smoke: import a card for a provider you have no integration for → toast guides to Settings; no partial run.

## Out of scope

- Backend atomic import endpoint; editing before running; multi-model cards; auto-uploading a custom dataset. (See spec §2 / §10.)
