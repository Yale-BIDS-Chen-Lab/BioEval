"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { Badge } from "../ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { statuses } from "@/schemas/inference";

type AggregateMetrics = Record<string, number>;

type EvaluationSummary = {
  count: number;
  hasRunningEvaluations: boolean;
  latestCompleted: {
    evaluationId: string;
    createdAt: string | null;
    metrics: string[];
    aggregate: AggregateMetrics;
  } | null;
};

type DetailedEvaluation = {
  evaluationId: string;
  status: "pending" | "processing" | "done" | "failed" | "canceled";
  metrics: string[];
  createdAt: string | null;
  aggregate: AggregateMetrics | null;
};

function formatCreatedAt(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.trim().replace(" ", "T");
  const withZone = /([zZ]|[+-]\d{2}:\d{2})$/.test(normalized)
    ? normalized
    : `${normalized}Z`;
  const safeIso = withZone.replace(/\.(\d{3})\d+/, ".$1");
  const date = new Date(safeIso);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(date);
}

function formatMetricName(metric: string) {
  const normalized = metric.toLowerCase();
  const names: Record<string, string> = {
    accuracy: "Accuracy",
    macro_f1: "Macro-F1",
    micro_f1: "Micro-F1",
    precision: "Precision",
    recall: "Recall",
    f1: "F1",
    bertscore: "BERTScore",
    bartscore: "BARTScore",
    meteor: "METEOR",
    rouge1: "ROUGE-1",
    rouge2: "ROUGE-2",
    rougel: "ROUGE-L",
    exact_match_precision: "Exact Match Precision",
    exact_match_recall: "Exact Match Recall",
    exact_match_f1: "Exact Match F1",
    llm_judge_correctness: "LLM Judge Correctness",
    llm_judge_completeness: "LLM Judge Completeness",
    llm_judge_relevance: "LLM Judge Relevance",
  };

  return names[normalized] ?? metric;
}

function formatMetricValue(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 4,
    useGrouping: false,
  }).format(value);
}

function preferredMetricOrder(taskName: string) {
  switch (taskName) {
    case "Multiple Choice Questions":
      return ["accuracy"];
    case "Named-entity Recognition":
      return ["exact_match_f1", "exact_match_precision", "exact_match_recall"];
    case "Generation":
      return [
        "rougel",
        "bertscore",
        "llm_judge_completeness",
        "bartscore",
        "meteor",
        "rouge1",
        "rouge2",
      ];
    default:
      return [];
  }
}

function pickSummaryMetrics(aggregate: AggregateMetrics, taskName: string) {
  const aggregateKeys = Object.keys(aggregate);
  const orderedKeys = [
    ...preferredMetricOrder(taskName),
    ...aggregateKeys,
  ].filter((key, index, arr) => arr.indexOf(key) === index);

  return orderedKeys
    .filter((key) => key in aggregate)
    .slice(0, 2)
    .map((key) => ({
      key,
      label: formatMetricName(key),
      value: aggregate[key],
    }));
}

function AggregateBadgeList({
  aggregate,
  taskName,
  maxShown = 6,
}: {
  aggregate: AggregateMetrics;
  taskName: string;
  maxShown?: number;
}) {
  const orderedKeys = [
    ...preferredMetricOrder(taskName),
    ...Object.keys(aggregate),
  ].filter((key, index, arr) => arr.indexOf(key) === index);

  const visibleMetrics = orderedKeys
    .filter((key) => key in aggregate)
    .slice(0, maxShown);

  if (visibleMetrics.length === 0) {
    return <div className="text-muted-foreground text-xs">No aggregate metrics yet</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {visibleMetrics.map((metricKey) => (
        <Badge key={metricKey} variant="secondary" className="font-mono text-[11px]">
          {formatMetricName(metricKey)} {formatMetricValue(aggregate[metricKey])}
        </Badge>
      ))}
    </div>
  );
}

export function InferenceEvaluationSummary({
  inferenceId,
  projectId,
  taskName,
  summary,
}: {
  inferenceId: string;
  projectId: string;
  taskName: string;
  summary?: EvaluationSummary;
}) {
  const [open, setOpen] = useState(false);

  const latestMetrics = useMemo(() => {
    if (!summary?.latestCompleted) return [];
    return pickSummaryMetrics(summary.latestCompleted.aggregate, taskName);
  }, [summary, taskName]);

  const detailQuery = useQuery({
    queryKey: ["inference-evaluation-summary", projectId, inferenceId],
    enabled: open,
    queryFn: async () =>
      axios.get("api/inference/evaluation-summary", {
        withCredentials: true,
        params: {
          projectId,
          inferenceId,
        },
      }),
    refetchInterval: (query) => {
      const hasRunning = query.state.data?.data?.summary?.hasRunningEvaluations;
      return hasRunning ? 2000 : false;
    },
  });

  if (!summary || summary.count === 0) {
    return <div className="text-muted-foreground text-sm">No evaluations</div>;
  }

  const detailedEvaluations: DetailedEvaluation[] =
    detailQuery.data?.data?.summary?.evaluations ?? [];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="hover:bg-muted/50 flex h-[76px] w-[210px] min-w-[210px] max-w-[210px] flex-col items-start gap-1 overflow-hidden rounded-md border px-3 py-2 text-left transition-colors">
          <div className="flex w-full items-center gap-2 overflow-hidden">
            <span className="truncate text-sm font-medium leading-tight">
              {summary.count} eval{summary.count === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground shrink-0 text-[10px] font-medium tracking-wide uppercase">
              Latest
            </span>
            {summary.hasRunningEvaluations && (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                Running
              </Badge>
            )}
          </div>
          <div className="min-h-[32px] w-full space-y-0.5 overflow-hidden">
            {summary.latestCompleted && latestMetrics.length > 0 ? (
              <>
                {latestMetrics.map((metric) => (
                  <div
                    key={metric.key}
                    className="text-muted-foreground w-full truncate text-xs leading-4"
                    title={`${metric.label} ${formatMetricValue(metric.value)}`}
                  >
                    {metric.label} {formatMetricValue(metric.value)}
                  </div>
                ))}
                {latestMetrics.length < 2 && (
                  <div className="invisible text-xs leading-4">placeholder</div>
                )}
              </>
            ) : summary.latestCompleted ? (
              <>
                <div className="text-muted-foreground w-full truncate text-xs leading-4">
                  Latest evaluation completed
                </div>
                <div className="invisible text-xs leading-4">placeholder</div>
              </>
            ) : (
              <>
                <div className="text-muted-foreground w-full truncate text-xs leading-4">
                  No completed evaluation yet
                </div>
                <div className="invisible text-xs leading-4">placeholder</div>
              </>
            )}
          </div>
        </button>
      </SheetTrigger>
      <SheetContent className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Evaluation Summary</SheetTitle>
          <SheetDescription>
            Review all evaluations for inference {inferenceId} without leaving
            the list page.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {detailQuery.isPending ? (
            <div className="text-muted-foreground text-sm">
              Loading evaluation summary...
            </div>
          ) : detailQuery.isError ? (
            <div className="text-destructive text-sm">
              Failed to load evaluation details.
            </div>
          ) : detailedEvaluations.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No evaluations found.
            </div>
          ) : (
            <div className="space-y-4">
              {detailedEvaluations.map((evaluation) => {
                const statusMeta = statuses.find(
                  (status) => status.value === evaluation.status
                );

                return (
                  <div
                    key={evaluation.evaluationId}
                    className="space-y-3 rounded-lg border p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="font-semibold">
                          {evaluation.evaluationId}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {formatCreatedAt(evaluation.createdAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusMeta?.icon && (
                          <statusMeta.icon className="text-muted-foreground h-4 w-4" />
                        )}
                        <span className="text-sm">{statusMeta?.label ?? evaluation.status}</span>
                      </div>
                    </div>

                    {evaluation.aggregate ? (
                      <AggregateBadgeList
                        aggregate={evaluation.aggregate}
                        taskName={taskName}
                      />
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2">
                          {evaluation.metrics.map((metric) => (
                            <Badge key={metric} variant="outline">
                              {formatMetricName(metric)}
                            </Badge>
                          ))}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {evaluation.status === "done"
                            ? "No aggregate metrics yet"
                            : "Aggregate results will appear when the evaluation finishes."}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
