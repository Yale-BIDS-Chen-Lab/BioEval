import { axios } from "@/lib/axios";
import type { Inference } from "@/schemas/inference";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { Columns2 } from "lucide-react";
import { columns } from "../data-table/columns/inference";
import { DataTable } from "../data-table/data-table";
import { OverallModelRanking } from "./overall-model-ranking";
import { Button } from "../ui/button";
import { toast } from "sonner";

function InferenceList() {
  const [selectedRows, setSelectedRows] = useState<Inference[]>([]);

  const navigate = useNavigate();
  const { projectId } = useParams({
    from: "/_authed/dashboard/project/$projectId/",
  });
  const { isPending, isError, data } = useQuery({
    queryKey: ["inferences", projectId],
    queryFn: () => {
      return axios.get("api/inference/list", {
        withCredentials: true,
        params: {
          projectId,
        },
      });
    },
    refetchInterval: (query) => {
      const inferences = query.state.data?.data?.inferences as
        | Inference[]
        | undefined;
      const hasRunningWork =
        Array.isArray(inferences) &&
        inferences.some(
          (inference) =>
            inference.status === "processing" ||
            inference.status === "pending" ||
            inference.evaluationSummary?.hasRunningEvaluations
        );

      return hasRunningWork ? 2000 : false;
    },
  });

  if (isPending || isError) {
    return <></>;
  }

  // Sort inferences: favorites first, then by ID (newest first)
  const inferences = [...data.data.inferences].sort((a, b) => {
    // First, sort by favorite status
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    // If both have same favorite status, maintain original order
    return 0;
  });

  const handleCompare = () => {
    if (selectedRows.length < 2) {
      toast.info("Select at least 2 inferences to compare.");
      return;
    }

    const datasetSet = new Set(selectedRows.map((r) => r.dataset));
    if (datasetSet.size > 1) {
      toast.error("Selected inferences must belong to the same dataset.");
      return;
    }

    const ids = selectedRows.map((r) => r.inferenceId).join(",");
    navigate({
      to: "/dashboard/project/$projectId/compare",
      params: {
        projectId,
      },
      search: {
        inferenceIds: ids,
      },
    });
  };

  const selectedCount = selectedRows.length;
  const canCompare = selectedCount >= 2;

  return (
    <div className="space-y-6">
      <OverallModelRanking inferences={inferences} />
      <DataTable
        data={inferences}
        columns={columns}
        onSelectionChange={setSelectedRows}
        compact
      >
        <Button
          className="h-10 cursor-pointer px-4 text-base font-semibold tracking-tight"
          variant={"outline"}
          onClick={() =>
            navigate({
              to: "/dashboard/project/$projectId/inference/create",
              params: {
                // TODO: resolve route param type inference
                // @ts-ignore
                projectId,
              },
            })
          }
        >
          New inference
        </Button>

        <Button
          className="h-10 min-w-[230px] cursor-pointer justify-between px-4 text-base font-semibold tracking-tight"
          variant="outline"
          onClick={handleCompare}
          title={
            canCompare
              ? "Compare selected inferences"
              : "Select at least 2 inferences to compare"
          }
        >
          <span className="inline-flex items-center gap-2">
            <Columns2 className="h-4 w-4" />
            Compare
          </span>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {canCompare ? "Ready" : `${selectedCount}/2 selected`}
          </span>
        </Button>
        {/* TODO: add model filter input */}
      </DataTable>
    </div>
  );
}

export { InferenceList };
