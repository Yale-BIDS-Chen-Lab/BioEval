import { axios } from "@/lib/axios";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { DataTable, Cell } from "@/components/dataview-table/table";
import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authed/dashboard/dataset/$datasetId")({
  component: RouteComponent,
});

const taskBadgeStyles: Record<string, string> = {
  "Multiple Choice Questions": "bg-sky-500/8 text-slate-700 dark:text-slate-200 border-sky-500/15",
  "Named-entity Recognition": "bg-emerald-500/8 text-slate-700 dark:text-slate-200 border-emerald-500/15",
  "Relation Extraction": "bg-violet-500/8 text-slate-700 dark:text-slate-200 border-violet-500/15",
  "Multi-label Classification": "bg-amber-500/8 text-slate-700 dark:text-slate-200 border-amber-500/15",
  "Generation": "bg-rose-500/8 text-slate-700 dark:text-slate-200 border-rose-500/15",
};

function RouteComponent() {
  const navigate = useNavigate();

  const { datasetId } = useParams({
    from: "/_authed/dashboard/dataset/$datasetId",
  });

  const {
    isPending: isMetadataPending,
    data: datasetMetadata,
  } = useQuery({
    queryKey: ["dataset-metadata", datasetId],
    queryFn: async () => {
      const response = await axios.get("api/dataset/get", {
        withCredentials: true,
        params: { datasetId },
      });
      return response.data.dataset;
    },
  });

  const { data = [] } = useQuery({
    queryKey: ["dataset-dataview"],
    queryFn: async () => {
      const response = await axios.get("api/dataset/dataview", {
        withCredentials: true,
        params: { datasetId },
      });
      return response.data.records;
    },
  });

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "id",
        header: () => (
          <div className="text-foreground text-left font-mono text-xs font-bold">ID</div>
        ),
        cell: ({ row }) => (
          <div className="font-mono text-xs text-muted-foreground whitespace-nowrap">{row.getValue("id")}</div>
        ),
      },
      {
        accessorKey: "input",
        header: () => (
          <div className="text-foreground text-left font-mono text-xs font-bold">Input</div>
        ),
        cell: ({ row }) => (
          <Cell value={row.getValue("input")} expanded={row.getIsSelected()} />
        ),
      },
      {
        accessorKey: "reference",
        header: () => (
          <div className="text-foreground text-left font-mono text-xs font-bold">Reference</div>
        ),
        cell: ({ row }) => (
          <Cell value={row.getValue("reference")} expanded={row.getIsSelected()} />
        ),
      },
    ],
    [],
  );

  if (isMetadataPending) return <></>;

  const badgeStyle =
    taskBadgeStyles[datasetMetadata?.taskName] ??
    "bg-slate-500/8 text-slate-700 dark:text-slate-200 border-slate-500/15";

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950/30">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">

      {/* Back nav */}
      <button
        onClick={() => navigate({ to: ".." })}
        className="mb-6 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground select-none"
      >
        <ArrowLeft className="size-4" />
        Datasets
      </button>

      {/* Header card */}
      <div className="mb-8 rounded-xl border bg-card px-8 py-7 shadow-sm">
        <div className="flex flex-col gap-3">
          <Badge variant="outline" className={`w-fit text-xs ${badgeStyle}`}>
            {datasetMetadata?.taskName}
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {datasetMetadata?.name}
          </h1>
          {(() => {
            const raw = datasetMetadata?.description ?? "";
            const lines = raw.split("\n");
            const lastLine = lines[lines.length - 1].trim();
            const isUrl = lastLine.startsWith("http");
            const body = isUrl ? lines.slice(0, -1).join("\n").trim() : raw;
            const url = isUrl ? lastLine : null;
            return (
              <>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">{body}</p>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="size-3" />
                    {url}
                  </a>
                )}
              </>
            );
          })()}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="dataview">Dataview</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-5">
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <div className="border-b bg-muted/40 px-6 py-3">
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Default Prompt
                </h3>
              </div>
              <pre className="whitespace-pre-wrap px-6 py-5 text-sm font-mono leading-relaxed text-foreground">
                {datasetMetadata?.defaultPrompt}
              </pre>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dataview">
          <div className="h-120 rounded-xl border overflow-hidden">
            <DataTable
              data={data}
              columns={columns}
              className="h-full w-full"
            />
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
