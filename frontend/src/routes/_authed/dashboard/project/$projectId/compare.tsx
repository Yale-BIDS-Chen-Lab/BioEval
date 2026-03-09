import { DataView } from "@/components/compare/compare-dataview";
import { axios } from "@/lib/axios";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarChart3, Loader2 } from "lucide-react";

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

  const [statsResult, setStatsResult] = useState<any>(null);
  const [sampleSize, setSampleSize] = useState(40);
  const [nBoot, setNBoot] = useState(1000);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string> | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: ["compare", ids],
    queryFn: () =>
      axios.get("api/inference/compare", {
        params: { inferenceIds: ids },
        withCredentials: true,
      }),
  });

  const statsMutation = useMutation({
    mutationFn: async () => {
      const records = data?.data?.records ?? [];
      const models = data?.data?.meta?.models ?? [];
      const commonMetrics = data?.data?.meta?.commonMetrics ?? [];
      const modelNames = models.map((m: any) => m.model);
      const metricsToAnalyze = selectedMetrics
        ? commonMetrics.filter((m: string) => selectedMetrics.has(m))
        : commonMetrics;
      const payload: Record<string, Record<string, number[]>> = {};
      for (const modelName of modelNames) {
        payload[modelName] = {};
        for (const metric of metricsToAnalyze) {
          const key = `${modelName}:${metric}`;
          const values = records
            .map((r: any) => r[key])
            .filter((v: any) => v !== undefined && v !== null)
            .map(Number)
            .filter((n: number) => !isNaN(n));
          payload[modelName][metric] = values;
        }
      }
      const { data: result } = await axios.post("api/inference/statistical-analysis", {
        models: payload,
        sampleSize,
        nBoot,
      }, { withCredentials: true });
      return result;
    },
    onSuccess: (result) => setStatsResult(result),
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

        {/* Statistical Analysis */}
        {models.length >= 2 && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>
                <span className="text-xs">Statistical Analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!statsResult ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Wilcoxon rank-sum tests + bootstrap confidence intervals.
                  </p>
                  {commonMetrics.length > 0 && (
                    <div>
                      <label className="font-mono text-xs text-muted-foreground">Metrics</label>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {commonMetrics.map((metric: string) => {
                          const active = !selectedMetrics || selectedMetrics.has(metric);
                          return (
                            <button
                              key={metric}
                              type="button"
                              onClick={() => {
                                setSelectedMetrics((prev) => {
                                  const current = prev ?? new Set(commonMetrics as string[]);
                                  const next = new Set(current);
                                  if (next.has(metric)) {
                                    next.delete(metric);
                                    if (next.size === 0) return null;
                                  } else {
                                    next.add(metric);
                                    if (next.size === commonMetrics.length) return null;
                                  }
                                  return next;
                                });
                              }}
                              className={`rounded-md border px-2 py-0.5 font-mono text-xs cursor-pointer transition ${
                                active
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-transparent opacity-50"
                              }`}
                            >
                              {formatMetricName(metric)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="font-mono text-xs text-muted-foreground">Sample Size</label>
                      <Input
                        type="number"
                        min={2}
                        value={sampleSize}
                        onChange={(e) => setSampleSize(Number(e.target.value) || 40)}
                        className="mt-1 h-8 font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-mono text-xs text-muted-foreground">Bootstrap N</label>
                      <Input
                        type="number"
                        min={100}
                        step={100}
                        value={nBoot}
                        onChange={(e) => setNBoot(Number(e.target.value) || 1000)}
                        className="mt-1 h-8 font-mono text-xs"
                      />
                    </div>
                  </div>
                  <Button
                    className="w-full gap-2 cursor-pointer"
                    onClick={() => statsMutation.mutate()}
                    disabled={statsMutation.isPending}
                  >
                    {statsMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <BarChart3 className="h-4 w-4" />
                    )}
                    {statsMutation.isPending ? "Analyzing..." : "Run Analysis"}
                  </Button>
                  {statsMutation.isError && (
                    <p className="text-xs text-red-500">Analysis failed. Is the inference service running?</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Bootstrap CIs */}
                  <div>
                    <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Bootstrap 95% CI
                    </div>
                    {Object.entries(statsResult.bootstrap ?? {}).map(([model, metrics]: [string, any]) => (
                      <div key={model} className="mb-3">
                        <div className="text-xs font-medium truncate mb-1" title={model}>{model}</div>
                        <div className="space-y-1">
                          {Object.entries(metrics).map(([metric, stats]: [string, any]) => (
                            <div key={metric} className="flex items-center justify-between">
                              <span className="font-mono text-xs text-muted-foreground">{formatMetricName(metric)}</span>
                              <span className="font-mono text-xs">
                                {stats.mean.toFixed(4)} [{stats.ci_low.toFixed(4)}, {stats.ci_high.toFixed(4)}]
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pairwise Tests */}
                  {statsResult.pairwise?.length > 0 && (
                    <div>
                      <div className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Pairwise Wilcoxon Tests
                      </div>
                      <div className="space-y-2">
                        {statsResult.pairwise.map((t: any, i: number) => (
                          <div key={i} className="rounded border p-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-medium">{formatMetricName(t.metric)}</span>
                              <span className={`font-mono text-xs font-semibold ${t.p_value < 0.05 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                                p={t.p_value < 0.001 ? t.p_value.toExponential(2) : t.p_value.toFixed(4)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate" title={`${t.modelA} vs ${t.modelB}`}>
                              {t.modelA} vs {t.modelB}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    className="w-full cursor-pointer"
                    size="sm"
                    onClick={() => setStatsResult(null)}
                  >
                    Reset
                  </Button>
                </div>
              )}
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
