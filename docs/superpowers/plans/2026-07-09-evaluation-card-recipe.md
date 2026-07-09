# Evaluation Card (Recipe) Export + Rename Results — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the existing per-run export from "evaluation card" to "results", and add a new config-only "evaluation card" (recipe) export that embeds the dataset rows so it can later be imported and re-run.

**Architecture:** Two parallel export endpoints. `/results` (renamed from the current `/card`) exports outputs+scores; a new `/card` exports the recipe (dataset rows + prompt + model/params + evaluation config). Both reuse `getEvaluationObject` + `S3Connection`. Pure builders (`buildEvaluationResults`, `buildEvaluationCard`) are unit-tested; I/O is verified by build + live smoke.

**Tech Stack:** TypeScript, Express, Drizzle, DuckDB-over-MinIO; React + axios; Node `node:test`.

---

## Testing note (read first)

Backend test harness is **unit-only** (`node:test`); there is no route/DB/S3 harness. Pure builders are TDD'd; I/O tasks are verified by TypeScript build (compare-to-baseline) + a live smoke after a rebuild. **The running app is up** (frontend `http://localhost:3000`, backend `http://localhost:3001`); current branch is `feat/evaluation-card-recipe`.

**Run backend unit tests** (use the `migrate` builder image — the `backend` image is prod-only and lacks `ts-node`):
```bash
cd /Users/xai/Desktop/BioEval
docker run --rm -v "$PWD/backend/src":/app/src -v "$PWD/backend/package.json":/app/package.json \
  -v "$PWD/backend/tsconfig.json":/app/tsconfig.json -w /app docker-files-migrate:latest sh -lc 'npm test'
```

**Type-check with a PRE-EXISTING error baseline** (the ad-hoc mount is missing a type-augmentation file → broken `AuthedRequest` typing; verify **no NEW errors** via stash+diff, not "zero errors"):
```bash
IMG=docker-files-migrate:latest
git stash push -- <the-file-you-changed>
docker run --rm -v "$PWD/backend/src":/app/src -v "$PWD/backend/package.json":/app/package.json \
  -v "$PWD/backend/tsconfig.json":/app/tsconfig.json -v "$PWD/backend/tsconfig.build.json":/app/tsconfig.build.json \
  -w /app "$IMG" sh -lc 'npx tsc -p tsconfig.build.json --noEmit' 2>&1 | grep -v tsbuildinfo | sort > /tmp/base.txt || true
git stash pop
docker run --rm -v "$PWD/backend/src":/app/src -v "$PWD/backend/package.json":/app/package.json \
  -v "$PWD/backend/tsconfig.json":/app/tsconfig.json -v "$PWD/backend/tsconfig.build.json":/app/tsconfig.build.json \
  -w /app "$IMG" sh -lc 'npx tsc -p tsconfig.build.json --noEmit' 2>&1 | grep -v tsbuildinfo | sort > /tmp/after.txt || true
diff /tmp/base.txt /tmp/after.txt   # expect empty
```
Tests use named imports only (`import { test } from "node:test"`). All commits use surgical `git add <files>` — the repo has untracked `.DS_Store` / `manuscripts/` that must NOT be staged.

---

## File Structure

- **Rename** `backend/src/services/evaluation-card.ts` → `backend/src/services/evaluation-results.ts` (results builder/types).
- **Rename** `backend/src/services/evaluation-card.test.ts` → `backend/src/services/evaluation-results.test.ts`.
- **Create** (fresh) `backend/src/services/evaluation-card.ts` — the NEW recipe builder + types.
- **Create** `backend/src/services/evaluation-card.test.ts` — recipe builder tests.
- **Modify** `backend/src/db/queries/evaluation.ts` — add `datasetDefaultPrompt` to `getEvaluationObject`.
- **Modify** `backend/src/routes/evaluation.ts` — rename assembler/route to results; add recipe assembler + `/card` route.
- **Modify** `frontend/src/components/evaluation/evaluation-dataview.tsx` — rename button to "Export results"; add "Export evaluation card" (recipe) button.

---

## Task 1: Backend rename — the current export becomes "results"

Atomic rename so the backend keeps compiling. Touches the service, its test, and the route file together.

**Files:**
- Rename: `backend/src/services/evaluation-card.ts` → `backend/src/services/evaluation-results.ts`
- Rename: `backend/src/services/evaluation-card.test.ts` → `backend/src/services/evaluation-results.test.ts`
- Modify: `backend/src/routes/evaluation.ts`

- [ ] **Step 1: git mv the service and its test**

```bash
cd /Users/xai/Desktop/BioEval
git mv backend/src/services/evaluation-card.ts backend/src/services/evaluation-results.ts
git mv backend/src/services/evaluation-card.test.ts backend/src/services/evaluation-results.test.ts
```

- [ ] **Step 2: Rename symbols inside `backend/src/services/evaluation-results.ts`**

Apply these exact renames (identifiers + the version key):
- `EvaluationCardPieces` → `RunPieces`
- `EvaluationCard` → `EvaluationResults`
- `EvaluationCardIncompleteError` → `EvaluationResultsIncompleteError`
- `buildEvaluationCard` → `buildEvaluationResults`
- the returned `bioeval: { cardVersion: "1.0", ... }` → `bioeval: { resultsVersion: "1.0", ... }` and the type `bioeval: { cardVersion: string; ... }` → `bioeval: { resultsVersion: string; ... }`
- update the incomplete-error default message string from "cannot build a card" → "cannot build results"

- [ ] **Step 3: Update `backend/src/services/evaluation-results.test.ts`**

- Change the import to `from "./evaluation-results"` and the imported names to `buildEvaluationResults`, `EvaluationResultsIncompleteError`, `type RunPieces`.
- Change the fixture return type annotation `EvaluationCardPieces` → `RunPieces`; the helper `completePieces` and calls stay.
- Change every `buildEvaluationCard(` → `buildEvaluationResults(`.
- Change assertions `card.bioeval.cardVersion` → `card.bioeval.resultsVersion`.
- Change the `assert.throws(..., EvaluationCardIncompleteError)` → `EvaluationResultsIncompleteError`.

- [ ] **Step 4: Update `backend/src/routes/evaluation.ts`**

- Imports: `import type { EvaluationCardPieces } from "../services/evaluation-card";` → `import type { RunPieces } from "../services/evaluation-results";` and `import { buildEvaluationCard } from "../services/evaluation-card";` → `import { buildEvaluationResults } from "../services/evaluation-results";`
- `type AssembleResult = ... { status: "ok"; pieces: EvaluationCardPieces }` → `pieces: RunPieces`
- Rename the function `assembleEvaluationCard` → `assembleRunData` (declaration + BOTH call sites: the `/dataview` handler and the current `/card` handler).
- Rewrite the current `/card` route to `/results`:

```ts
router.get(
  "/results",
  ...validatedRoute(
    dataviewSchema,
    async (req, res) => {
      const assembled = await assembleRunData(
        req.query.evaluationId,
        req.user.id
      );
      if (assembled.status === "not-found") {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Evaluation doesn't exist" });
      }
      if (assembled.status === "not-ready") {
        return res.status(StatusCodes.CONFLICT).json({
          success: false,
          error: "Evaluation is not complete; cannot export results yet",
        });
      }
      const results = buildEvaluationResults(
        assembled.pieces,
        new Date().toISOString()
      );
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="evaluation-results-${req.query.evaluationId}.json"`
      );
      return res.status(StatusCodes.OK).send(JSON.stringify(results, null, 2));
    },
    "query"
  )
);
```

- [ ] **Step 5: Unit tests + type-check baseline**

Run the unit tests (Testing note) → all pass (still 15). Run the type-check-baseline against `backend/src/routes/evaluation.ts` (and the renamed service) → empty diff.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/evaluation-results.ts backend/src/services/evaluation-results.test.ts backend/src/routes/evaluation.ts
git commit -m "refactor(evaluation): rename the per-run export from evaluation card to results"
```

---

## Task 2: Frontend rename — "Export results"

**Files:**
- Modify: `frontend/src/components/evaluation/evaluation-dataview.tsx`

- [ ] **Step 1: Repoint `download()` at `/results` and rename the file**

In the existing `download` function, change the endpoint and filename:
- `axios.get("api/evaluation/card", ...)` → `axios.get("api/evaluation/results", ...)`
- `a.download = \`evaluation-card-${evaluationId}.json\`;` → `a.download = \`evaluation-results-${evaluationId}.json\`;`

Leave the try/catch + toast as-is.

- [ ] **Step 2: Relabel the button**

Find the button whose `onClick` is `download` and change its visible text from `Export evaluation card` to `Export results`.

- [ ] **Step 3: Verify**

Confirm the diff is only those two strings + the button label (`git diff`). Do NOT rebuild (a single rebuild happens at the end).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/evaluation/evaluation-dataview.tsx
git commit -m "refactor(frontend): rename Export evaluation card button to Export results"
```

---

## Task 3: Add `datasetDefaultPrompt` to `getEvaluationObject`

The recipe embeds the dataset's `defaultPrompt` (needed so a later import can re-upload the dataset).

**Files:**
- Modify: `backend/src/db/queries/evaluation.ts`

- [ ] **Step 1: Add the field to the select**

In `getEvaluationObject`'s `.select({...})`, add (next to `datasetClasses`):

```ts
      datasetDefaultPrompt: dataset.defaultPrompt,
```

(`dataset.defaultPrompt` exists on the `dataset` table in `schema.ts`; `dataset` is already joined.)

- [ ] **Step 2: Type-check baseline** (empty diff) and **unit tests** (still pass).

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/queries/evaluation.ts
git commit -m "feat(evaluation): expose dataset defaultPrompt in getEvaluationObject"
```

---

## Task 4: New recipe pure builder `buildEvaluationCard` + unit tests (TDD)

**Files:**
- Create: `backend/src/services/evaluation-card.ts` (fresh — the old one was renamed to evaluation-results.ts in Task 1)
- Test: `backend/src/services/evaluation-card.test.ts`

- [ ] **Step 1: Write the failing test — `backend/src/services/evaluation-card.test.ts`:**

```ts
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
  assert.equal(card.dataset.rows[0].input, "raw dialogue"); // RAW input, not rendered prompt
  assert.equal(card.prompt.template, "Summarize: {{input}}");
  assert.equal(card.model.provider, "azure");
  assert.equal(card.model.identifier, "gpt-5.4");
  assert.deepEqual(card.evaluation.metrics, ["rougeL", "bertscore"]);
  assert.ok(card.evaluation.parsingFunctions);
  assert.equal((card.evaluation.llmJudge as any).model, "gpt-5");
  // recipe must NOT contain results
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
```

- [ ] **Step 2: Run tests → verify FAIL** (module `./evaluation-card` not found).

- [ ] **Step 3: Create `backend/src/services/evaluation-card.ts`:**

```ts
export type EvaluationCardRecipePieces = {
  status: string;
  task: { id: string; name: string };
  dataset: {
    name: string;
    defaultPrompt: string;
    classes: unknown | null;
    rows: { id: string; input: string; reference: string }[];
  };
  prompt: string; // the run's prompt template (inference.prompt)
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
```

- [ ] **Step 4: Run tests → verify PASS** (3 new + existing all green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/evaluation-card.ts backend/src/services/evaluation-card.test.ts
git commit -m "feat(evaluation): pure buildEvaluationCard recipe builder with unit tests"
```

---

## Task 5: Recipe assembler + `GET /card` route

**Files:**
- Modify: `backend/src/routes/evaluation.ts`

- [ ] **Step 1: Add the recipe assembler** (top-level, near `assembleRunData`). Import the recipe types:

```ts
import type { EvaluationCardRecipePieces } from "../services/evaluation-card";
import { buildEvaluationCard } from "../services/evaluation-card";
```

```ts
type RecipeResult =
  | { status: "not-found" }
  | { status: "not-ready" }
  | { status: "ok"; pieces: EvaluationCardRecipePieces };

async function assembleEvaluationCardRecipe(
  evaluationId: string,
  userId: string
): Promise<RecipeResult> {
  const ev = await getEvaluationObject(evaluationId, userId);
  if (!ev) return { status: "not-found" };
  if (ev.status !== "done" || !ev.datasetObjectKey) {
    return { status: "not-ready" };
  }

  const s3conn = await new S3Connection().connect();
  try {
    s3conn.createTable("dataset", ev.datasetObjectKey);
    const res = await s3conn.con.runAndReadAll(
      `SELECT id, input, reference FROM dataset`
    );
    const rows = res.getRowObjectsJson() as {
      id: string;
      input: string;
      reference: string;
    }[];

    return {
      status: "ok",
      pieces: {
        status: ev.status,
        task: { id: ev.taskId, name: ev.taskName },
        dataset: {
          name: ev.datasetName,
          defaultPrompt: ev.datasetDefaultPrompt,
          classes: ev.datasetClasses ?? null,
          rows,
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
  } finally {
    await s3conn.dispose();
  }
}
```

- [ ] **Step 2: Add the `/card` route** (near `/results`):

```ts
router.get(
  "/card",
  ...validatedRoute(
    dataviewSchema,
    async (req, res) => {
      const assembled = await assembleEvaluationCardRecipe(
        req.query.evaluationId,
        req.user.id
      );
      if (assembled.status === "not-found") {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Evaluation doesn't exist" });
      }
      if (assembled.status === "not-ready") {
        return res.status(StatusCodes.CONFLICT).json({
          success: false,
          error: "Evaluation is not complete; cannot export a card yet",
        });
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
    },
    "query"
  )
);
```

- [ ] **Step 3: Type-check baseline** (empty diff) + **unit tests** (pass).

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/evaluation.ts
git commit -m "feat(evaluation): GET /card endpoint exporting a runnable recipe with embedded dataset"
```

---

## Task 6: Frontend "Export evaluation card" (recipe) button

**Files:**
- Modify: `frontend/src/components/evaluation/evaluation-dataview.tsx`

- [ ] **Step 1: Add a recipe download function** next to `download`:

```ts
  const downloadCard = async () => {
    try {
      const res = await axios.get("api/evaluation/card", {
        params: { evaluationId },
        withCredentials: true,
      });
      const a = document.createElement("a");
      const file = new Blob([JSON.stringify(res.data, null, 2)], {
        type: "application/json",
      });
      a.href = URL.createObjectURL(file);
      a.download = `evaluation-card-${evaluationId}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.error ?? "Failed to export the evaluation card."
      );
    }
  };
```

- [ ] **Step 2: Add a second button** next to the "Export results" button (same `<Button variant="ghost" size="sm" className="cursor-pointer">` style, with the `Download` icon), with `onClick={downloadCard}` and visible text `Export evaluation card`.

- [ ] **Step 3: Verify** the diff is only the new function + the new button (`git diff`). Do NOT rebuild yet.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/evaluation/evaluation-dataview.tsx
git commit -m "feat(frontend): Export evaluation card (recipe) button"
```

---

## Final verification (controller, after all tasks)

- One rebuild: `docker compose --project-directory docker-files up -d --build backend frontend`.
- Live smoke on a completed evaluation: **Export results** downloads `evaluation-results-<id>.json` (with `records`/`aggregate`); **Export evaluation card** downloads `evaluation-card-<id>.json` whose `dataset.rows` length equals the dataset size, `model`/`prompt`/`evaluation` config present, and NO `records`/`aggregate`.

## Out of scope (do NOT build here)

- Import / reconstitute / run a recipe (follow-on spec; dashboard entry point).
- Multi-model recipe; reference-only dataset option; materialised cards.

## After merge (not a code task): manuscript reconciliation

Update paper §11 so "evaluation card" = the recipe (exportable reproducibility unit) and "results" = the outputs; keep "re-scored without re-running inference" tied to results; do NOT yet claim "import a card and re-run" (that ships with the import spec).
