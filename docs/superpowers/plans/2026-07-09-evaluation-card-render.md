# Evaluation Card — Compact Recipe + Rendered Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Revise the merged recipe export so the card is a compact recipe that *references* its dataset, is exportable at any run status (no 409), and is shown in a rendered preview dialog opened from the evaluations-list row menu (off the deep results page).

**Architecture:** Backend simplifies the recipe assembler (no dataset-parquet read; pure `getEvaluationObject`), the builder drops embedded rows + the status gate, and `/card` drops its 409. Frontend adds an `EvaluationCardDialog` (fetch + render sections + Download JSON), wired into `DataTableRowActions` for evaluations; the deep-page "Export evaluation card" button is removed.

**Tech Stack:** TypeScript, Express, Drizzle; React + TanStack Query + axios + shadcn/ui; Node `node:test`.

---

## Testing note

Backend harness is unit-only. Pure builder = TDD; I/O + frontend = build + one live smoke after a rebuild. Current branch `feat/evaluation-card-render`. Run backend tests with the **migrate** builder image (backend image lacks ts-node):
```bash
cd /Users/xai/Desktop/BioEval
docker run --rm -v "$PWD/backend/src":/app/src -v "$PWD/backend/package.json":/app/package.json \
  -v "$PWD/backend/tsconfig.json":/app/tsconfig.json -w /app docker-files-migrate:latest sh -lc 'npm test'
```
Type-check has a pre-existing error baseline (ad-hoc mount) → verify "no NEW errors" via stash+diff (`npx tsc -p tsconfig.build.json --noEmit` before/after, `grep -v tsbuildinfo | sort`, `diff` must be empty). Surgical `git add <files>` only (untracked `.DS_Store`/`manuscripts/` must not be staged).

---

## File Structure

- **Modify** `backend/src/db/queries/evaluation.ts` — remove the now-unused `datasetDefaultPrompt` select.
- **Modify** `backend/src/services/evaluation-card.ts` — compact recipe type/builder (dataset reference; no rows; no status throw).
- **Modify** `backend/src/services/evaluation-card.test.ts` — update the recipe tests.
- **Modify** `backend/src/routes/evaluation.ts` — simplify `assembleEvaluationCardRecipe` (no S3 read, no not-ready); drop the `/card` 409 branch.
- **Create** `frontend/src/components/evaluation/evaluation-card-dialog.tsx` — the rendered preview.
- **Modify** `frontend/src/components/data-table/data-table-row-actions.tsx` — add "Evaluation card" item + dialog for evaluations.
- **Modify** `frontend/src/components/evaluation/evaluation-dataview.tsx` — remove the "Export evaluation card" button + its `downloadCard`.

---

## Task 1: Remove the now-unused `datasetDefaultPrompt`

The compact recipe references the dataset (id/name/task) and no longer embeds/recreates it, so `datasetDefaultPrompt` is unused.

**Files:** Modify `backend/src/db/queries/evaluation.ts`

- [ ] **Step 1:** In `getEvaluationObject`'s `.select({...})`, DELETE the line `datasetDefaultPrompt: dataset.defaultPrompt,`. Leave `datasetClasses` and everything else (it is still used by the results builder).
- [ ] **Step 2:** Type-check baseline (stash push -- this file) → empty diff. Unit tests still pass (18).
- [ ] **Step 3:** Commit:
```bash
git add backend/src/db/queries/evaluation.ts
git commit -m "refactor(evaluation): drop unused datasetDefaultPrompt from getEvaluationObject"
```

---

## Task 2: Compact recipe builder (dataset reference, no status gate) — TDD

**Files:** Modify `backend/src/services/evaluation-card.ts` and `backend/src/services/evaluation-card.test.ts`

- [ ] **Step 1: Replace the test file `backend/src/services/evaluation-card.test.ts` with:**

```ts
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildEvaluationCard,
  type EvaluationCardRecipePieces,
} from "./evaluation-card";

function recipe(): EvaluationCardRecipePieces {
  return {
    dataset: { id: "ds123", name: "HoC", task: { id: "mlc", name: "Multi-label classification" } },
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
  assert.deepEqual(card.dataset, { id: "ds123", name: "HoC", task: { id: "mlc", name: "Multi-label classification" } });
  // dataset is a reference — no embedded rows
  assert.equal((card.dataset as any).rows, undefined);
  assert.equal(card.prompt.template, "Classify: {{input}}");
  assert.equal(card.model.identifier, "gpt-5.4");
  assert.deepEqual(card.evaluation.metrics, ["rougeL", "bertscore"]);
  assert.ok(card.evaluation.parsingFunctions);
  assert.equal((card.evaluation.llmJudge as any).model, "gpt-5");
  // no results
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
```

- [ ] **Step 2:** Run tests → the first test FAILS (old builder still requires `status`/`task`/`dataset.rows` shape and throws / mismatches). This confirms the test drives the change.

- [ ] **Step 3: Replace `backend/src/services/evaluation-card.ts` with:**

```ts
export type EvaluationCardRecipePieces = {
  dataset: { id: string; name: string; task: { id: string; name: string } };
  prompt: string;
  model: { provider: string; identifier: string; parameters: unknown };
  metrics: unknown;
  parsingFunctions: unknown | null;
  llmJudgeConfig: unknown | null;
};

export type EvaluationCard = {
  bioeval: { cardVersion: string; exportedAt: string };
  dataset: { id: string; name: string; task: { id: string; name: string } };
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
```

Note: `EvaluationCardIncompleteError` is intentionally removed (a recipe is valid at any status).

- [ ] **Step 4:** Run tests → PASS (2 recipe tests + others = 17 total, since the old 3rd "throws" test is gone).

- [ ] **Step 5:** Commit:
```bash
git add backend/src/services/evaluation-card.ts backend/src/services/evaluation-card.test.ts
git commit -m "feat(evaluation): compact recipe card that references the dataset, no status gate"
```

---

## Task 3: Simplify the recipe assembler + drop the `/card` 409

**Files:** Modify `backend/src/routes/evaluation.ts`

- [ ] **Step 1: Update the import** — the recipe service no longer exports `EvaluationCardIncompleteError`; keep:
```ts
import type { EvaluationCardRecipePieces } from "../services/evaluation-card";
import { buildEvaluationCard } from "../services/evaluation-card";
```

- [ ] **Step 2: Replace the whole `assembleEvaluationCardRecipe` function** (and its `RecipeResult` type) with a version that does no S3 read and has no not-ready state:
```ts
type RecipeResult =
  | { status: "not-found" }
  | { status: "ok"; pieces: EvaluationCardRecipePieces };

async function assembleEvaluationCardRecipe(
  evaluationId: string,
  userId: string
): Promise<RecipeResult> {
  const ev = await getEvaluationObject(evaluationId, userId);
  if (!ev) return { status: "not-found" };
  return {
    status: "ok",
    pieces: {
      dataset: {
        id: ev.datasetId,
        name: ev.datasetName,
        task: { id: ev.taskId, name: ev.taskName },
      },
      prompt: ev.prompt,
      model: {
        provider: ev.providerId,
        identifier: ev.modelName,
        parameters: ev.parameters,
      },
      metrics: ev.metrics,
      parsingFunctions: ev.parsingFunctions ?? null,
      llmJudgeConfig: ev.llmJudgeConfig ?? null,
    },
  };
}
```

- [ ] **Step 3: Update the `/card` route** — remove the `not-ready`/409 branch and the `new Date().toISOString()` call stays. The handler body becomes:
```ts
      const assembled = await assembleEvaluationCardRecipe(
        req.query.evaluationId,
        req.user.id
      );
      if (assembled.status === "not-found") {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Evaluation doesn't exist" });
      }
      const card = buildEvaluationCard(
        assembled.pieces,
        new Date().toISOString()
      );
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="evaluation-card-${req.query.evaluationId}.json"`
      );
      return res.status(StatusCodes.OK).send(JSON.stringify(card, null, 2));
```
Do NOT touch `/dataview`, `/results`, or `assembleRunData`.

- [ ] **Step 4:** Type-check baseline (stash push -- this file) → empty diff. Unit tests pass (17).

- [ ] **Step 5:** Commit:
```bash
git add backend/src/routes/evaluation.ts
git commit -m "feat(evaluation): /card recipe assembles from config only, exportable at any status"
```

---

## Task 4: `EvaluationCardDialog` rendered preview component

**Files:** Create `frontend/src/components/evaluation/evaluation-card-dialog.tsx`

- [ ] **Step 1: Create the component:**

```tsx
"use client";

import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";

import { axios } from "@/lib/axios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface EvaluationCardDialogProps {
  evaluationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-start gap-3">
      <div className="text-muted-foreground font-medium">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EvaluationCardDialog({
  evaluationId,
  open,
  onOpenChange,
}: EvaluationCardDialogProps) {
  const { data: card, isLoading, isError } = useQuery({
    queryKey: ["evaluation-card", evaluationId],
    enabled: open,
    queryFn: async () => {
      try {
        const res = await axios.get("api/evaluation/card", {
          params: { evaluationId },
          withCredentials: true,
        });
        return res.data as any;
      } catch (err: any) {
        toast.error(err?.response?.data?.error ?? "Failed to load the evaluation card.");
        throw err;
      }
    },
  });

  const downloadJson = () => {
    if (!card) return;
    const a = document.createElement("a");
    const file = new Blob([JSON.stringify(card, null, 2)], {
      type: "application/json",
    });
    a.href = URL.createObjectURL(file);
    a.download = `evaluation-card-${evaluationId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Evaluation card</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-5 w-56" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="text-muted-foreground text-sm">
            Could not load the evaluation card.
          </p>
        )}

        {card && (
          <div className="space-y-4 text-sm">
            <Row label="Dataset">
              <span className="font-medium">{card.dataset?.name}</span>
              <span className="text-muted-foreground"> · {card.dataset?.task?.name}</span>
            </Row>
            <Separator />
            <Row label="Prompt">
              <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                {card.prompt?.template}
              </pre>
            </Row>
            <Separator />
            <Row label="Model">
              <div>
                <span className="font-medium">{card.model?.identifier}</span>{" "}
                <span className="text-muted-foreground">({card.model?.provider})</span>
              </div>
              {Array.isArray(card.model?.parameters) && card.model.parameters.length > 0 && (
                <div className="text-muted-foreground mt-1 text-xs">
                  {card.model.parameters
                    .map((p: any) => `${p.id} = ${p.value}`)
                    .join(" · ")}
                </div>
              )}
            </Row>
            <Separator />
            <Row label="Evaluation">
              <div className="flex flex-wrap gap-1">
                {(card.evaluation?.metrics ?? []).map((m: string) => (
                  <Badge key={m} variant="secondary">
                    {m}
                  </Badge>
                ))}
              </div>
              {Array.isArray(card.evaluation?.parsingFunctions) &&
                card.evaluation.parsingFunctions.length > 0 && (
                  <div className="text-muted-foreground mt-2 text-xs">
                    parsing:{" "}
                    {card.evaluation.parsingFunctions
                      .map((f: any) => f.id)
                      .join(", ")}
                  </div>
                )}
              {card.evaluation?.llmJudge && (
                <div className="text-muted-foreground mt-1 text-xs">
                  LLM judge: {card.evaluation.llmJudge.model ?? "—"}
                  {card.evaluation.llmJudge.scale
                    ? ` · scale ${card.evaluation.llmJudge.scale}`
                    : ""}
                </div>
              )}
            </Row>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={downloadJson} disabled={!card}>
            <Download className="mr-2 h-4 w-4" />
            Download JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify** the file references only existing primitives (`@/components/ui/{badge,button,dialog,separator,skeleton}` all exist; `@/lib/axios`, `sonner`, `lucide-react`, `@tanstack/react-query` are all used elsewhere in the repo). Do NOT rebuild yet.

- [ ] **Step 3: Commit:**
```bash
git add frontend/src/components/evaluation/evaluation-card-dialog.tsx
git commit -m "feat(frontend): EvaluationCardDialog renders a recipe card preview + JSON download"
```

---

## Task 5: Wire the dialog into the evaluations row menu; remove the deep-page button

**Files:** Modify `frontend/src/components/data-table/data-table-row-actions.tsx` and `frontend/src/components/evaluation/evaluation-dataview.tsx`

- [ ] **Step 1: In `data-table-row-actions.tsx`:**
  - Add to the lucide import: `FileText` (i.e. `import { MoreHorizontal, Trash2, Copy, Star, XCircle, FileText } from "lucide-react";`).
  - Add the dialog import: `import { EvaluationCardDialog } from "@/components/evaluation/evaluation-card-dialog";`
  - Add state after `const [showDeleteDialog, setShowDeleteDialog] = useState(false);`:
    ```ts
    const [showCardDialog, setShowCardDialog] = useState(false);
    ```
  - In `<DropdownMenuContent>`, add an item BEFORE the Delete item, guarded by `isEvaluation`:
    ```tsx
          {isEvaluation && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => setShowCardDialog(true)}
            >
              <FileText className="mr-2 h-4 w-4" />
              Evaluation card
            </DropdownMenuItem>
          )}
    ```
  - After the closing `</Dialog>` of the delete dialog (still inside the top-level fragment `<> ... </>`), add:
    ```tsx
      {isEvaluation && (
        <EvaluationCardDialog
          evaluationId={evaluationId}
          open={showCardDialog}
          onOpenChange={setShowCardDialog}
        />
      )}
    ```

- [ ] **Step 2: In `evaluation-dataview.tsx`, remove the deep-page recipe export** (keep "Export results"):
  - Delete the `downloadCard` function entirely.
  - Delete the "Export evaluation card" `<Button ... onClick={downloadCard}>...</Button>` block (the sibling of the "Export results" button).

- [ ] **Step 3: Verify** with `git diff`: row-actions gains the import + state + one menu item + the dialog element; evaluation-dataview loses `downloadCard` + its button (and nothing else). Do NOT rebuild (controller does one rebuild + live smoke).

- [ ] **Step 4: Commit:**
```bash
git add frontend/src/components/data-table/data-table-row-actions.tsx frontend/src/components/evaluation/evaluation-dataview.tsx
git commit -m "feat(frontend): open Evaluation card preview from evaluations row menu; drop deep-page button"
```

---

## Final verification (controller, after all tasks)

- One rebuild: `docker compose --project-directory docker-files up -d --build backend frontend`.
- Live smoke: from an inference's Evaluations list, open a row's ⋯ → **Evaluation card** → the dialog renders Dataset/Prompt/Model/Evaluation sections; **Download JSON** yields a compact `evaluation-card-<id>.json` with a `dataset` reference (`{id,name,task}`, NO `rows`), model+params, evaluation config, and NO results. Confirm it works for a still-running (not `done`) evaluation too. Confirm the deep results page still has "Export results" only.

## Out of scope

- Import / run a card (follow-on spec; dashboard entry point).
- Results export changes; multi-model recipe.
