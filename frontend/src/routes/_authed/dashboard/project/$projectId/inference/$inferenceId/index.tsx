"use client";

import { createFileRoute, Link } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartColumn, Table2Icon, AlertTriangle, ArrowRight } from "lucide-react";
import { DataView } from "@/components/inference/inference-dataview";
import { useQuery } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Container } from "@/components/create-evaluation/container";
import { Plus } from "lucide-react";

export const Route = createFileRoute(
  "/_authed/dashboard/project/$projectId/inference/$inferenceId/",
)({
  component: RouteComponent,
});

export function RouteComponent() {
  const { inferenceId, projectId } = Route.useParams();
  const { data = [] } = useQuery({
    queryKey: ["inference-dataview", inferenceId],
    queryFn: async () => {
      const { data } = await axios.get("api/inference/dataview", {
        withCredentials: true,
        params: { projectId, inferenceId },
      });
      return data;
    },
  });
  const datasetExampleCount =
    data?.meta?.totalExamples ?? data?.records?.length ?? 0;

  return (
    <div className="grid h-full w-full grid-cols-4 overflow-hidden bg-zinc-50 dark:bg-zinc-950/30">
      <div className="col-span-1 border-r px-6 py-4">
        <p className="mb-6 text-xl font-semibold tracking-tight">Inference</p>

        {data?.meta && (
          <Card className="mb-4 w-full">
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
                    src={`/logos/${data.meta?.provider?.id}.svg`}
                    alt={`${data.meta?.provider?.name ?? "Provider"} logo`}
                    width={22}
                    height={22}
                    className="select-none"
                  />
                  <span className="truncate font-mono text-xs">
                    {data.meta?.model}
                  </span>
                </div>
              </div>

              <div className="flex justify-between">
                <span className="font-mono text-xs">Status</span>
                <span className="font-mono text-xs">{data.meta.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs">Dataset</span>
                <span className="truncate font-mono text-xs">
                  {data.meta.dataset?.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs">Examples</span>
                <span className="font-mono text-xs">{datasetExampleCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-xs">Task</span>
                <span className="font-mono text-xs">
                  {data.meta.task?.name}
                </span>
              </div>

              {Array.isArray(data?.meta?.parameters) &&
                data.meta.parameters.length > 0 && (
                  <div className="pt-2">
                    <div className="mb-1 font-mono text-xs font-semibold">
                      Parameters
                    </div>
                    <div className="space-y-1">
                      {data.meta.parameters.map(
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
                  {data.meta?.prompt ?? "—"}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button className="w-full gap-2 cursor-pointer">
                <Plus className="h-4 w-4" />
                New Evaluation
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl w-full">
              <Container projectId={projectId} inferenceId={inferenceId} />
            </DialogContent>
          </Dialog>

          <Link
            from={Route.fullPath}
            to="./evaluation"
            className="hover:bg-muted flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition"
          >
            <ChartColumn className="h-4 w-4" />
            View Evaluations
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="col-span-3 flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="border-b px-4 py-2">
          <Tabs defaultValue="dataview">
            <TabsList>
              <TabsTrigger value="dataview">
                <Table2Icon />
                Dataview
              </TabsTrigger>
              <TabsTrigger value="evaluations">
                <Link
                  from={Route.fullPath}
                  to="./evaluation"
                  className="inline-flex items-center gap-1.5"
                >
                  <ChartColumn />
                  Evaluations
                </Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {/* Warning banner for canceled inferences */}
        {data?.meta?.status === "canceled" && (
          <div className="px-4 pt-4">
            <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>⚠️ This inference was canceled.</strong>{" "}
                {data?.meta?.totalExamples && data?.meta?.processedExamples !== null && data?.meta?.processedExamples !== undefined ? (
                  <>
                    Showing partial results ({data.meta.processedExamples}/{data.meta.totalExamples} examples completed).
                  </>
                ) : (
                  <>
                    Showing partial results.
                  </>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        <DataView data={data?.records ?? []} />
      </div>
    </div>
  );
}
