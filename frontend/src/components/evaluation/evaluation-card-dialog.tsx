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
import { Skeleton } from "@/components/ui/skeleton";

interface EvaluationCardDialogProps {
  evaluationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Shared data fetching + helpers (reused by the inference-level dialog)
// ---------------------------------------------------------------------------

export function useEvaluationCard(
  evaluationId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: ["evaluation-card", evaluationId],
    enabled: enabled && !!evaluationId,
    retry: false,
    queryFn: async () => {
      try {
        const res = await axios.get("api/evaluation/card", {
          params: { evaluationId },
          withCredentials: true,
        });
        return res.data as any;
      } catch (err: any) {
        toast.error(
          err?.response?.data?.error ?? "Failed to load the evaluation card."
        );
        throw err;
      }
    },
  });
}

export function downloadCardJson(card: any, evaluationId: string) {
  if (!card) return;
  const a = document.createElement("a");
  const file = new Blob([JSON.stringify(card, null, 2)], {
    type: "application/json",
  });
  a.href = URL.createObjectURL(file);
  a.download = `evaluation-card-${evaluationId}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Presentational — one regular definition grid. Type variants kept minimal:
// xs muted for labels, sm for values, mono only for literal config (prompt,
// decoding params). Every row uses the same <Field>.
// ---------------------------------------------------------------------------

function formatParamValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground pt-px text-xs">{label}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </>
  );
}

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

export function CardBody({ card }: { card: any }) {
  const classes: string[] = Array.isArray(card.dataset?.classes)
    ? card.dataset.classes
    : [];
  const params = Array.isArray(card.model?.parameters)
    ? card.model.parameters
    : [];
  const metrics: string[] = Array.isArray(card.evaluation?.metrics)
    ? card.evaluation.metrics
    : [];
  const parsing = Array.isArray(card.evaluation?.parsingFunctions)
    ? card.evaluation.parsingFunctions
    : [];
  const judge = card.evaluation?.llmJudge;
  const judgeEntries =
    judge && typeof judge === "object"
      ? Object.entries(judge).filter(
          ([metricId, cfg]) =>
            cfg && typeof cfg === "object" && metrics.includes(metricId)
        )
      : [];

  return (
    <dl className="grid grid-cols-[92px_1fr] items-baseline gap-x-4 gap-y-3">
      <Field label="Dataset">
        <span className="font-medium">{card.dataset?.name ?? "—"}</span>
        {card.dataset?.task?.name && (
          <span className="text-muted-foreground">
            {" "}
            · {card.dataset.task.name}
          </span>
        )}
      </Field>

      <Field label="Label set">
        {classes.length > 0 ? classes.join(", ") : <Dash />}
      </Field>

      <Field label="Prompt">
        {card.prompt?.template ? (
          <pre className="bg-muted/60 max-h-40 overflow-auto rounded-md p-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {card.prompt.template}
          </pre>
        ) : (
          <Dash />
        )}
      </Field>

      <Field label="Model">
        {card.model?.identifier ?? "—"}
        {card.model?.provider && (
          <span className="text-muted-foreground"> ({card.model.provider})</span>
        )}
      </Field>

      <Field label="Parameters">
        {params.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {params.map((p: any) => (
              <span
                key={p.id}
                className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs"
              >
                {p.id} = {formatParamValue(p.value)}
              </span>
            ))}
          </div>
        ) : (
          <Dash />
        )}
      </Field>

      <Field label="Postprocess">
        {parsing.length > 0 ? (
          parsing.map((f: any) => f.id ?? "parser").join(", ")
        ) : (
          <Dash />
        )}
      </Field>

      <Field label="Metrics">
        {metrics.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {metrics.map((m) => (
              <Badge key={m} variant="secondary">
                {m}
              </Badge>
            ))}
          </div>
        ) : (
          <Dash />
        )}
      </Field>

      <Field label="LLM judge">
        {judgeEntries.length > 0 ? (
          <div className="space-y-0.5">
            {judgeEntries.map(([metricId, cfg]: [string, any]) => (
              <div key={metricId}>
                {metricId}: {cfg.model ?? "—"}
                {cfg.scale ? ` · scale ${cfg.scale}` : ""}
              </div>
            ))}
          </div>
        ) : (
          <Dash />
        )}
      </Field>
    </dl>
  );
}

export function EvaluationCardSections({
  card,
  isLoading,
  isError,
}: {
  card: any;
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }
  if (isError) {
    return (
      <p className="text-muted-foreground text-sm">
        Could not load the evaluation card.
      </p>
    );
  }
  if (!card) return null;
  return <CardBody card={card} />;
}

// ---------------------------------------------------------------------------
// Evaluation-level dialog (opened from the evaluations list row menu)
// ---------------------------------------------------------------------------

export function EvaluationCardDialog({
  evaluationId,
  open,
  onOpenChange,
}: EvaluationCardDialogProps) {
  const { data: card, isLoading, isError } = useEvaluationCard(
    evaluationId,
    open
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[600px]">
        <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>Evaluation card</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Reproducible recipe — the configuration needed to re-run this
            evaluation.
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-5">
          <EvaluationCardSections
            card={card}
            isLoading={isLoading}
            isError={isError}
          />
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => downloadCardJson(card, evaluationId)}
            disabled={!card}
          >
            <Download className="mr-2 h-4 w-4" />
            Download JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
