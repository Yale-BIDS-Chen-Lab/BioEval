import { DataView } from "@/components/evaluation/evaluation-dataview";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { axios } from "@/lib/axios";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute(
  "/_authed/dashboard/project/$projectId/inference/$inferenceId/evaluation/$evaluationId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const { evaluationId, inferenceId } = useParams({
    from: "/_authed/dashboard/project/$projectId/inference/$inferenceId/evaluation/$evaluationId",
  });
  const { data } = useQuery({
    queryKey: ["evaluation-dataview", evaluationId],
    queryFn: async () => {
      const response = await axios.get("api/evaluation/dataview", {
        withCredentials: true,
        params: {
          evaluationId,
        },
      });
      return response.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.meta?.status;
      return status === "pending" || status === "processing" ? 2000 : false;
    },
  });
  const datasetExampleCount =
    data?.meta?.totalExamples ??
    data?.meta?.processedExamples ??
    data?.records?.length ??
    0;

  return (
    <div className="grid h-full w-full grid-cols-4 overflow-hidden bg-zinc-50 dark:bg-zinc-950/30">
      <div className="col-span-1 border-r px-6 py-4">
        <button
          onClick={() => navigate({ to: ".." })}
          className="mb-4 flex cursor-pointer items-center gap-1.5 p-0 text-sm text-muted-foreground transition-colors hover:text-foreground select-none"
        >
          <ArrowLeft className="size-4" />
          Back
        </button>

        <p className="mb-6 text-xl font-semibold tracking-tight">Evaluation</p>

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

        {data?.aggregate && (
          <Card className="w-full">
            <CardHeader>
              <CardTitle>
                <span className="text-xs">Aggregate Metrics</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {Object.entries(data.aggregate).map(([metric, score]) => (
                  <li key={metric} className="flex justify-between">
                    <span className="font-mono text-xs">{metric}</span>
                    <span className="font-mono text-xs">
                      {(score as number).toFixed(4)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="col-span-3 flex h-full min-w-0 flex-col overflow-hidden">
        <DataView 
          data={data?.records ?? []} 
          inferenceId={inferenceId}
          evaluationId={evaluationId}
          taskId={data?.meta?.task?.id}
          evaluationMetrics={data?.meta?.evaluationMetrics ?? []}
        />
      </div>
    </div>
  );
}
