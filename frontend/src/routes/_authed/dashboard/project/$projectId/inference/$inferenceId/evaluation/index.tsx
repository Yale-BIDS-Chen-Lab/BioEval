"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartColumn, Table2Icon } from "lucide-react";
import { EvaluationsList } from "@/components/inference/evaluations-list";
import { useQuery } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute(
  "/_authed/dashboard/project/$projectId/inference/$inferenceId/evaluation/",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { inferenceId } = Route.useParams();

  const { data: meta } = useQuery({
    queryKey: ["inference-meta", inferenceId],
    queryFn: async () => {
      const { data } = await axios.get("/api/inference/meta", {
        withCredentials: true,
        params: { inferenceId },
      });
      return data.meta;
    },
  });
  const datasetExampleCount = meta?.totalExamples ?? meta?.processedExamples ?? 0;

  return (
    <div className="grid h-full w-full grid-cols-4 overflow-hidden bg-zinc-50 dark:bg-zinc-950/30">
      <div className="col-span-1 border-r px-6 py-4">
        <p className="mb-6 text-xl font-semibold tracking-tight">Inference</p>
        {meta && (
          <Card className="mt-6 w-full">
            <CardHeader>
              <CardTitle>
                <span className="text-xs">Run Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">Model</span>
                <div className="inline-flex max-w-[65%] items-center gap-2">
                  <img
                    src={`/logos/${meta?.provider?.id}.svg`}
                    alt={`${meta?.provider?.name ?? "Provider"} logo`}
                    width={22}
                    height={22}
                    className="select-none"
                  />
                  <span className="truncate font-mono text-xs">
                    {meta?.model}
                  </span>
                </div>
              </div>

              <div className="flex justify-between">
                <span className="font-mono text-xs">Status</span>
                <span className="font-mono text-xs">{meta.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs">Dataset</span>
                <span className="truncate font-mono text-xs">
                  {meta.dataset?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs">Examples</span>
                <span className="font-mono text-xs">{datasetExampleCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs">Task</span>
                <span className="font-mono text-xs">{meta.task?.name}</span>
              </div>

              {Array.isArray(meta?.parameters) &&
                meta.parameters.length > 0 && (
                  <div className="pt-2">
                    <div className="mb-1 font-mono text-xs font-semibold">
                      Parameters
                    </div>
                    <div className="space-y-1">
                      {meta.parameters.map(
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

              <div className="pt-2">
                <div className="mb-1 font-mono text-xs font-semibold">
                  Prompt
                </div>
                <div className="max-h-40 overflow-auto rounded-md border bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap break-words">
                  {meta?.prompt ?? "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="col-span-3 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="border-b px-4 py-2">
          <Tabs defaultValue="evaluations">
            <TabsList>
              <TabsTrigger value="dataview">
                <Link
                  from={Route.fullPath}
                  to=".."
                  className="inline-flex items-center gap-1.5"
                >
                  <Table2Icon />
                  Dataview
                </Link>
              </TabsTrigger>
              <TabsTrigger value="evaluations">
                <ChartColumn />
                Evaluations
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <EvaluationsList />
      </div>
    </div>
  );
}
