# Evaluation Card Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend endpoint and a GUI button that export one completed evaluation run as a single, self-contained JSON "evaluation card" (config + postprocessing code + metric/judge config + aggregate + per-example records).

**Architecture:** Live-assemble on request (no DB schema change). A single I/O function `assembleEvaluationCard(evaluationId, userId)` gathers a run's pieces from Postgres + object-storage Parquet + annotation tables; a **pure** function `buildEvaluationCard(pieces, exportedAt)` shapes them into the card JSON. Both the existing `/dataview` route and the new `/card` route call the assembler, so there is one source of truth.

**Tech Stack:** TypeScript, Express, Drizzle ORM, DuckDB-over-S3/MinIO; frontend React + axios + TanStack Query. Backend tests: Node built-in runner (`node:test`) run in a throwaway Docker container (host has no npm network).

---

## Testing note (read first)

The backend test harness is **unit-only** (`backend/src/**/*.test.ts` via `node:test`); there is **no route/DB/S3 integration harness**, and adding one is out of scope (per the design spec §2). Therefore:

- The **pure** card-shaping logic (`buildEvaluationCard`) is developed **test-first** (Tasks 2).
- The **I/O** pieces (DB query change, assembler, route wiring, frontend) are verified by **TypeScript build** and a **live smoke test against the running stack** (the app is already up: frontend `http://localhost:3000`, backend `http://localhost:3001`). This is called out explicitly in each such task.

**Run the backend unit tests** (throwaway container, non-destructive):
```bash
cd /Users/xai/Desktop/BioEval
IMG=$(docker inspect docker-files-backend-1 --format '{{.Config.Image}}')
docker run --rm -v "$PWD/backend/src":/app/src -v "$PWD/backend/package.json":/app/package.json \
  -v "$PWD/backend/tsconfig.json":/app/tsconfig.json -w /app "$IMG" sh -lc 'npm test'
```

**Type-check the backend:**
```bash
docker run --rm -v "$PWD/backend/src":/app/src -v "$PWD/backend/package.json":/app/package.json \
  -v "$PWD/backend/tsconfig.json":/app/tsconfig.json -v "$PWD/backend/tsconfig.build.json":/app/tsconfig.build.json \
  -w /app "$IMG" sh -lc 'npx tsc -p tsconfig.build.json --noEmit'
```

Tests use named imports only: `import { test } from "node:test"`, `import { strict as assert } from "node:assert"` (no esModuleInterop).

---

## File Structure

- **Create** `backend/src/services/evaluation-card.ts` — types (`EvaluationCardPieces`, `EvaluationCard`), `EvaluationCardIncompleteError`, pure `buildEvaluationCard(pieces, exportedAt)`.
- **Create** `backend/src/services/evaluation-card.test.ts` — unit tests for `buildEvaluationCard`.
- **Modify** `backend/src/db/queries/evaluation.ts` — extend `getEvaluationObject` select with `parsingFunctions`, `llmJudgeConfig`, `datasetClasses`.
- **Modify** `backend/src/routes/evaluation.ts` — add `assembleEvaluationCard()` (extracting the `/dataview` assembly), refactor `/dataview` to use it, add the `GET /card` route.
- **Modify** `frontend/src/components/evaluation/evaluation-dataview.tsx` — repoint `download()` at `/card` and relabel the button.

---

## Task 1: Extend `getEvaluationObject` with the missing config fields

**Files:**
- Modify: `backend/src/db/queries/evaluation.ts:111-132` (the `.select({...})` inside `getEvaluationObject`)

Rationale: the card needs the postprocessing code (`evaluation.parsingFunctions`), the judge config (`evaluation.llmJudgeConfig`), and the dataset label set (`dataset.classes`) — none of which the current select returns.

- [ ] **Step 1: Add three fields to the select object**

In `getEvaluationObject`, add these keys to the `.select({...})` (alongside the existing `metrics`, `prompt`, etc.):

```ts
      parsingFunctions: evaluation.parsingFunctions,
      llmJudgeConfig: evaluation.llmJudgeConfig,
      datasetClasses: dataset.classes,
```

Leave the joins and `where` unchanged.

- [ ] **Step 2: Type-check**

Run the type-check command from the Testing note.
Expected: no errors (the three columns exist on `evaluation`/`dataset` in `schema.ts`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/queries/evaluation.ts
git commit -m "feat(evaluation): expose parsingFunctions, llmJudgeConfig, dataset classes in getEvaluationObject"
```

---

## Task 2: Pure `buildEvaluationCard` + unit tests (TDD)

**Files:**
- Create: `backend/src/services/evaluation-card.ts`
- Test: `backend/src/services/evaluation-card.test.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/services/evaluation-card.test.ts`:

```ts
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
  // the fields the old export omitted:
  assert.ok(card.postprocessing, "postprocessing (parser code) present");
  assert.equal(card.metrics.llmJudge.model, "gpt-5");
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run the backend unit-test command from the Testing note.
Expected: FAIL — cannot find module `./evaluation-card`.

- [ ] **Step 3: Write the implementation**

Create `backend/src/services/evaluation-card.ts`:

```ts
export type EvaluationCardPieces = {
  evaluationId: string;
  inferenceId: string;
  datasetId: string;
  status: string;
  meta: {
    // fields buildEvaluationCard reads:
    model: string;
    provider: { id: string; name: string };
    dataset: { id: string; name: string };
    task: { id: string; name: string };
    prompt: string;
    parameters: unknown;
    evaluationMetrics: unknown;
    // extra fields the assembler carries for /dataview (superset avoids type friction):
    status?: string;
    totalExamples?: number | null;
    processedExamples?: number | null;
    humanEvaluationProgress?: unknown;
  };
  aggregate: Record<string, unknown>;
  records: Record<string, unknown>[];
  parsingFunctions: unknown | null;
  llmJudgeConfig: unknown | null;
  datasetClasses: unknown | null;
};

export type EvaluationCard = {
  bioeval: { cardVersion: string; exportedAt: string };
  evaluation: {
    evaluationId: string;
    inferenceId: string;
    datasetId: string;
    status: string;
  };
  dataset: {
    id: string;
    name: string;
    task: { id: string; name: string };
    canonicalSchema: string[];
    classes: unknown | null;
  };
  prompt: { template: string };
  model: {
    provider: { id: string; name: string };
    identifier: string;
    parameters: unknown;
  };
  postprocessing: unknown | null;
  metrics: { list: unknown; llmJudge: unknown | null };
  aggregate: Record<string, unknown>;
  records: Record<string, unknown>[];
};

export class EvaluationCardIncompleteError extends Error {
  constructor(message = "Evaluation is not complete; cannot build a card") {
    super(message);
    this.name = "EvaluationCardIncompleteError";
  }
}

export function buildEvaluationCard(
  p: EvaluationCardPieces,
  exportedAt: string
): EvaluationCard {
  if (p.status !== "done") {
    throw new EvaluationCardIncompleteError();
  }
  return {
    bioeval: { cardVersion: "1.0", exportedAt },
    evaluation: {
      evaluationId: p.evaluationId,
      inferenceId: p.inferenceId,
      datasetId: p.datasetId,
      status: p.status,
    },
    dataset: {
      id: p.meta.dataset.id,
      name: p.meta.dataset.name,
      task: p.meta.task,
      canonicalSchema: ["id", "input", "reference"],
      classes: p.datasetClasses ?? null,
    },
    prompt: { template: p.meta.prompt },
    model: {
      provider: p.meta.provider,
      identifier: p.meta.model,
      parameters: p.meta.parameters,
    },
    postprocessing: p.parsingFunctions ?? null,
    metrics: { list: p.meta.evaluationMetrics, llmJudge: p.llmJudgeConfig ?? null },
    aggregate: p.aggregate,
    records: p.records,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run the backend unit-test command.
Expected: PASS (3 tests in `evaluation-card.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/evaluation-card.ts backend/src/services/evaluation-card.test.ts
git commit -m "feat(evaluation): pure buildEvaluationCard card-shaping function with unit tests"
```

---

## Task 3: Extract `assembleEvaluationCard` and refactor `/dataview` to use it

**Files:**
- Modify: `backend/src/routes/evaluation.ts` (the `/dataview` handler, lines ~277-404)

Goal: move the run-assembly I/O out of the `/dataview` handler into a reusable async function that returns a discriminated result, then make `/dataview` a thin consumer. Behaviour of `/dataview` must be unchanged.

- [ ] **Step 1: Add the `assembleEvaluationCard` function**

Add this function to `backend/src/routes/evaluation.ts` (top-level, after imports, before `const router`). It contains the exact logic currently inside the `/dataview` handler, with the differences: (a) it also carries `parsingFunctions`, `llmJudgeConfig`, `datasetClasses`; (b) it returns pieces instead of calling `res.json`; (c) not-found → `{ status: "not-found" }`, not-ready → `{ status: "not-ready" }`.

```ts
import type { EvaluationCardPieces } from "../services/evaluation-card";

type AssembleResult =
  | { status: "not-found" }
  | { status: "not-ready" }
  | { status: "ok"; pieces: EvaluationCardPieces };

async function assembleEvaluationCard(
  evaluationId: string,
  userId: string
): Promise<AssembleResult> {
  const evaluation = await getEvaluationObject(evaluationId, userId);
  if (!evaluation) return { status: "not-found" };
  if (
    evaluation.status !== "done" ||
    !evaluation.evaluationObjectKey ||
    !evaluation.inferenceObjectKey
  ) {
    return { status: "not-ready" };
  }

  const s3conn = await new S3Connection().connect();
  try {
    s3conn.createTable("dataset", evaluation.datasetObjectKey);
    s3conn.createTable("inference", evaluation.inferenceObjectKey);
    s3conn.createTable("evaluation", evaluation.evaluationObjectKey);

    const result = await s3conn.con.runAndReadAll(`
      SELECT *
      FROM dataset
      JOIN inference ON dataset.id = inference.id
      JOIN (
        SELECT
          unnest(evaluation.rows).id as id,
          unnest(evaluation.rows).metrics as metrics,
          unnest(evaluation.rows).parsed as parsed,
          unnest(evaluation.rows).parsedVector as parsedVector,
          unnest(evaluation.rows).referenceVector as referenceVector
        FROM evaluation
      ) as unnested ON dataset.id = unnested.id
    `);

    const aggregateResult = await s3conn.con.runAndReadAll(`
      SELECT aggregate FROM evaluation
    `);
    const aggregateRow = aggregateResult.getRowObjectsJS()[0];
    const aggregate: Record<string, unknown> = aggregateRow?.aggregate
      ? (aggregateRow.aggregate as { key: string; value: any }[]).reduce<
          Record<string, unknown>
        >((acc, { key, value }) => {
          acc[key] = value;
          return acc;
        }, {})
      : {};

    const humanScores = await getHumanScores(evaluationId);
    const hasHumanEvaluation = Array.isArray(evaluation.metrics)
      ? evaluation.metrics.includes("human_evaluation")
      : false;
    if (hasHumanEvaluation) {
      const humanAggregate = await getHumanScoreAggregate(evaluationId);
      if (humanAggregate.human_evaluation_mean !== null) {
        aggregate.human_evaluation_mean = humanAggregate.human_evaluation_mean;
      }
      aggregate.human_evaluation_count = humanAggregate.human_evaluation_count;
    }

    const effectiveStatus = await getEffectiveEvaluationStatus({
      evaluationId,
      metrics: evaluation.metrics,
      status: evaluation.status as
        | "pending"
        | "processing"
        | "done"
        | "failed"
        | "canceled",
      totalExamples: evaluation.totalExamples ?? evaluation.processedExamples ?? 0,
    });

    const notesByRowId = await getNotes(evaluation.inferenceId);
    const records = result
      .getRowObjectsJson()
      .map((record: Record<string, unknown>) => {
        const out: Record<string, unknown> = { ...record };
        for (const key of Object.keys(out)) {
          if (/^id:\d+$/.test(key)) delete out[key];
        }
        out.input = evaluation.prompt.replaceAll(
          "{{input}}",
          record.input as string
        );
        out.notes = notesByRowId[(record.id as string) ?? ""] ?? "";
        out.humanScore = humanScores[(record.id as string) ?? ""] ?? null;
        return out;
      });

    const meta = {
      model: evaluation.modelName,
      provider: { id: evaluation.providerId, name: evaluation.providerName },
      status: effectiveStatus.status,
      dataset: { id: evaluation.datasetId, name: evaluation.datasetName },
      task: { id: evaluation.taskId, name: evaluation.taskName },
      prompt: evaluation.prompt,
      evaluationMetrics: evaluation.metrics,
      parameters: evaluation.parameters,
      totalExamples: evaluation.totalExamples,
      processedExamples: evaluation.processedExamples,
      humanEvaluationProgress: hasHumanEvaluation
        ? {
            ratedRows: effectiveStatus.ratedRows,
            totalRows: effectiveStatus.totalRows,
          }
        : null,
    };

    return {
      status: "ok",
      pieces: {
        evaluationId,
        inferenceId: evaluation.inferenceId,
        datasetId: evaluation.datasetId,
        status: evaluation.status,
        meta,
        aggregate,
        records,
        parsingFunctions: evaluation.parsingFunctions ?? null,
        llmJudgeConfig: evaluation.llmJudgeConfig ?? null,
        datasetClasses: evaluation.datasetClasses ?? null,
      },
    };
  } finally {
    await s3conn.dispose();
  }
}
```

> Note: `EvaluationCardPieces.meta` (Task 2) is already the superset (`status/totalExamples/processedExamples/humanEvaluationProgress` are optional there), so this `meta` object assigns cleanly. Keep the `meta` object identical to what `/dataview` returns today.

- [ ] **Step 2: Refactor the `/dataview` handler to use it**

Replace the body of the `/dataview` handler (everything from `const evaluation = await getEvaluationObject(...)` through the final `return res.json({ success: true, records, aggregate, meta });`) with:

```ts
      const assembled = await assembleEvaluationCard(
        req.query.evaluationId,
        req.user.id
      );
      if (assembled.status === "not-found") {
        return res
          .status(StatusCodes.NOT_FOUND)
          .json({ success: false, error: "Evaluation doesn't exist" });
      }
      if (assembled.status === "not-ready") {
        return res.json({ success: true, records: [] });
      }
      const { meta, aggregate, records } = assembled.pieces;
      return res.json({ success: true, records, aggregate, meta });
```

- [ ] **Step 3: Type-check**

Run the type-check command.
Expected: no errors. (If `meta` field mismatches surface, widen the `meta` type in `evaluation-card.ts` to match the object built above.)

- [ ] **Step 4: Live regression smoke — `/dataview` still works**

With the stack running, open an existing completed evaluation in the GUI (`http://localhost:3000` → a project → an inference → an evaluation) and confirm the results table, aggregate scores, and metadata still render exactly as before.
Expected: identical to pre-refactor behaviour.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/evaluation.ts backend/src/services/evaluation-card.ts
git commit -m "refactor(evaluation): extract assembleEvaluationCard shared by /dataview"
```

---

## Task 4: Add the `GET /card` route

**Files:**
- Modify: `backend/src/routes/evaluation.ts` (add a route near `/dataview`; it reuses `dataviewSchema`, which validates `{ evaluationId }` in the query)

Note: we follow the codebase convention (query param + `validatedRoute`) rather than the spec's illustrative path param, so the route is `GET /api/evaluation/card?evaluationId=...`. The download filename still encodes the id.

- [ ] **Step 1: Add the route**

Add near the `/dataview` route in `backend/src/routes/evaluation.ts`, and import `buildEvaluationCard`:

```ts
import { buildEvaluationCard } from "../services/evaluation-card";
```

```ts
router.get(
  "/card",
  ...validatedRoute(
    dataviewSchema,
    async (req, res) => {
      const assembled = await assembleEvaluationCard(
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

- [ ] **Step 2: Type-check**

Run the type-check command. Expected: no errors.

- [ ] **Step 3: Restart backend so the new route is live**

```bash
cd /Users/xai/Desktop/BioEval
docker compose --project-directory docker-files restart backend
```
Expected: backend healthy again.

- [ ] **Step 4: Live smoke — the endpoint returns a full card**

Grab a completed `evaluationId` from Postgres, then curl the endpoint through a logged-in browser session (the endpoint requires auth). Easiest: use the GUI button added in Task 5. As a backend-only check, confirm the route is registered:
```bash
docker compose --project-directory docker-files logs backend | grep -i "card" | tail
```
Then verify end-to-end via the Task 5 GUI button (downloaded JSON has `bioeval`, `model.parameters`, `postprocessing`, `metrics.llmJudge`, `aggregate`, and `records[]` with `output`+`parsed`).
Expected: 200 + attachment; incomplete/other-user ids → 409/404.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/evaluation.ts
git commit -m "feat(evaluation): GET /card endpoint exporting a run as one evaluation-card JSON"
```

---

## Task 5: Frontend "Export evaluation card" button

**Files:**
- Modify: `frontend/src/components/evaluation/evaluation-dataview.tsx` (the `download` function ~438-446, and the button that calls it)

The component already receives `evaluationId` as a prop. Currently `download()` dumps the `data` (records array) to `export.json`.

- [ ] **Step 1: Repoint `download()` at the card endpoint**

Replace the existing `download` function with:

```ts
  const download = async () => {
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
  };
```

(`axios` is already imported in this file; confirm with a grep and add `import axios from "axios";` only if missing.)

- [ ] **Step 2: Relabel the button**

Find the button whose `onClick` is `download` (grep for `onClick={download}` in this file) and change its visible label text to `Export evaluation card`.

- [ ] **Step 3: Live smoke — download a card from the GUI**

In the running app, open a completed evaluation's results page and click **Export evaluation card**. Open the downloaded `evaluation-card-<id>.json` and confirm it contains: `bioeval.cardVersion`, `model.parameters`, `postprocessing`, `metrics.llmJudge` (for an LLM-judge run), `aggregate`, and `records[]` entries with both `output` (raw) and `parsed` (postprocessed).
Expected: a complete card downloads and parses as JSON.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/evaluation/evaluation-dataview.tsx
git commit -m "feat(frontend): Export evaluation card button downloads the full run card"
```

---

## Out of scope (do NOT build here)

- Import / re-run of a card (separate follow-on spec).
- Materialising/persisting the card; DB schema changes.
- Comparison/pairwise-statistics export.
- Parquet download from the interface.
- Changing the inference-page records-only export.

**Deliberate deviation from spec §4:** the DB `evaluation.createdAt` is omitted from the card. `getEvaluationObject` has a legacy path for databases missing that column, and adding it to the select would either reintroduce that risk or add complexity for little reproducibility value; `bioeval.exportedAt` records export time instead.

## After merge (separate, not a code task)

Update the manuscript wording per design §11: "single configuration file / exportable evaluation card" is now true; change "(JSON and Parquet) exported from the interface" to state the card is a JSON export (Parquet remains internal storage).
