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
// Presentational — two type sizes only: text-sm for primary values,
// text-xs (muted) for secondary detail. Mono is reserved for literal config.
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground/70 text-sm italic">{children}</span>
  );
}

function formatParamValue(value: unknown) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
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
  // Only show judge configs for metrics actually enabled on this evaluation.
  const judgeEntries =
    judge && typeof judge === "object"
      ? Object.entries(judge).filter(
          ([metricId, cfg]) =>
            cfg && typeof cfg === "object" && metrics.includes(metricId)
        )
      : [];

  return (
    <>
      <Section title="Dataset registration">
        <p className="text-sm font-medium">{card.dataset?.name ?? "—"}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {card.dataset?.task?.name ?? "—"} · canonical{" "}
          {"{id, input, reference}"} schema
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Label set:{" "}
          {classes.length > 0 ? (
            <span className="text-foreground">{classes.join(", ")}</span>
          ) : (
            <span className="italic">none (unlabeled task)</span>
          )}
        </p>
      </Section>

      <Section title="Prompt">
        {card.prompt?.template ? (
          <pre className="bg-muted/60 text-foreground max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {card.prompt.template}
          </pre>
        ) : (
          <Placeholder>No prompt template recorded.</Placeholder>
        )}
      </Section>

      <Section title="Model">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">
            {card.model?.identifier ?? "—"}
          </span>
          {card.model?.provider && (
            <Badge variant="outline" className="font-normal">
              {card.model.provider}
            </Badge>
          )}
        </div>
      </Section>

      <Section title="Decoding parameters">
        {params.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {params.map((p: any) => (
              <span
                key={p.id}
                className="bg-muted rounded px-2 py-0.5 font-mono text-xs"
              >
                {p.id} = {formatParamValue(p.value)}
              </span>
            ))}
          </div>
        ) : (
          <Placeholder>Provider defaults (none specified).</Placeholder>
        )}
      </Section>

      <Section title="Postprocessing">
        {parsing.length > 0 ? (
          <ul className="space-y-1">
            {parsing.map((f: any, i: number) => (
              <li key={f.id ?? i} className="text-sm leading-relaxed">
                <span className="font-mono text-xs">{f.id ?? "parser"}</span>
                {Array.isArray(f.arguments) && f.arguments.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    · {f.arguments.length} arg
                    {f.arguments.length > 1 ? "s" : ""}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Placeholder>None — raw outputs are scored as-is.</Placeholder>
        )}
      </Section>

      <Section title="Metrics">
        {metrics.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {metrics.map((m) => (
              <Badge key={m} variant="secondary">
                {m}
              </Badge>
            ))}
          </div>
        ) : (
          <Placeholder>None specified.</Placeholder>
        )}
      </Section>

      <Section title="LLM-as-judge">
        {judgeEntries.length > 0 ? (
          <ul className="space-y-1">
            {judgeEntries.map(([metricId, cfg]: [string, any]) => (
              <li key={metricId} className="text-sm leading-relaxed">
                <span className="font-mono text-xs">{metricId}</span>
                <span className="text-muted-foreground text-xs">
                  {" "}
                  · {cfg.model ?? "—"}
                  {cfg.scale ? ` · scale ${cfg.scale}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Placeholder>Not used.</Placeholder>
        )}
      </Section>

      <p className="text-muted-foreground/70 border-t pt-3 text-xs leading-relaxed">
        Statistics and output artifacts (raw / postprocessed outputs, per-example
        scores, annotations) are recorded with the comparison and the results
        export — not in this recipe card.
      </p>
    </>
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

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-6 py-5">
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
