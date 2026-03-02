import { DataView } from "@/components/compare/compare-dataview";
import { axios } from "@/lib/axios";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Helper function to format metric names for display
const formatMetricName = (metric: string): string => {
  const upperMetric = metric.toUpperCase();
  
  // Handle ROUGE metrics
  if (upperMetric.startsWith('ROUGE')) {
    const num = metric.replace(/[^0-9]/g, '');
    if (num) {
      return `ROUGE-${num}`;
    }
    // Handle rougeL
    if (metric.toLowerCase() === 'rougel') {
      return 'ROUGE-L';
    }
    return upperMetric;
  }
  
  // Handle specific known metrics
  const metricMap: Record<string, string> = {
    'bertscore': 'BERTScore',
    'bartscore': 'BARTScore',
    'bleu': 'BLEU',
    'meteor': 'METEOR',
    'accuracy': 'Accuracy',
    'f1': 'F1',
    'precision': 'Precision',
    'recall': 'Recall',
  };
  
  return metricMap[metric.toLowerCase()] || metric;
};

export const Route = createFileRoute(
  "/_authed/dashboard/project/$projectId/compare",
)({
  component: RouteComponent,
  validateSearch: z.object({
    inferenceIds: z.string().nonempty(),
  }),
});

function RouteComponent() {
  const { inferenceIds } = Route.useSearch();
  const ids = useMemo(() => inferenceIds.split(","), [inferenceIds]);

  const { data, isPending, isError } = useQuery({
    queryKey: ["compare", ids],
    queryFn: () =>
      axios.get("api/inference/compare", {
        params: { inferenceIds: ids },
        withCredentials: true,
      }),
  });

  if (isPending || isError) return <></>;

  const records = data.data.records;
  const models = data.data.meta?.models ?? [];
  const commonMetrics = data.data.meta?.commonMetrics ?? [];
  const aggregateMetrics = data.data.meta?.aggregateMetrics ?? {};

  return (
    <div className="grid h-full w-full grid-cols-4 overflow-hidden bg-zinc-50 dark:bg-zinc-950/30">
      <div className="col-span-1 border-r px-6 py-4 overflow-y-auto">
        <p className="mb-6 text-xl font-semibold tracking-tight">Comparison</p>

        {/* Aggregate Metrics Card - Shown first */}
        {Object.keys(aggregateMetrics).length > 0 && (
          <Card className="mb-4 w-full">
            <CardHeader>
              <CardTitle>
                <span className="text-xs">Overall Metrics</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {commonMetrics.map((metric: string) => (
                  <div key={metric} className="space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {formatMetricName(metric)}
                    </div>
                    <div className="space-y-1">
                      {Object.entries(aggregateMetrics).map(([modelName, metrics]: [string, any]) => {
                        const metricObj = Array.isArray(metrics) 
                          ? metrics.reduce((acc: any, item: any) => {
                              if (item.key) acc[item.key] = item.value;
                              return acc;
                            }, {})
                          : metrics;
                        
                        const value = metricObj[metric];
                        if (value === undefined) return null;
                        
                        return (
                          <div key={modelName} className="flex items-center justify-between py-1">
                            <span className="text-xs truncate max-w-[60%]" title={modelName}>
                              {modelName}
                            </span>
                            <span className="font-mono text-xs font-semibold">
                              {typeof value === 'number' ? value.toFixed(4) : value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mb-4 w-full">
          <CardHeader>
            <CardTitle>
              <span className="text-xs">Models</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {models.map((m: any) => (
              <div key={m.inferenceId} className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">Model</span>
                  <div className="inline-flex max-w-[65%] items-center gap-2">
                    <img
                      src={`/logos/${m.provider?.id}.svg`}
                      alt={`${m.provider?.name ?? "Provider"} logo`}
                      width={16}
                      height={16}
                      className="select-none"
                    />
                    <span
                      className="truncate font-mono text-xs"
                      title={`${m.provider?.name ?? m.provider.id} · ${m.model}`}
                    >
                      {m.model}
                    </span>
                  </div>
                </div>

                {Array.isArray(m?.parameters) &&
                  m.parameters.length > 0 && (
                    <div className="pt-2">
                      <div className="mb-1 font-mono text-xs font-semibold">
                        Parameters
                      </div>
                      <div className="space-y-1">
                        {m.parameters.map(
                          (p: { id: string; value: unknown }) => (
                            <div
                              key={p.id}
                              className="flex items-center justify-between"
                            >
                              <span className="font-mono text-xs">{p.id}</span>
                              <span
                                className="max-w-[65%] truncate font-mono text-xs"
                                title={
                                  typeof p.value === "object"
                                    ? JSON.stringify(p.value)
                                    : String(p.value ?? "—")
                                }
                              >
                                {typeof p.value === "object"
                                  ? JSON.stringify(p.value)
                                  : String(p.value ?? "—")}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
              </div>
            ))}
          </CardContent>
        </Card>

        {commonMetrics.length > 0 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>
                <span className="text-xs">Per-Example Metrics</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {commonMetrics.map((metric: string) => (
                  <div key={metric} className="rounded px-2 py-1 bg-slate-100 dark:bg-slate-800">
                    <span className="font-mono text-xs">{metric}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Click metric buttons in the toolbar to show per-example scores
              </p>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="col-span-3 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <DataView
          data={records}
          commonMetrics={commonMetrics}
          modelNames={models.map((m: any) => m.model)}
        />
      </div>
    </div>
  );
}
