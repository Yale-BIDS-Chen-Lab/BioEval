import { axios } from "@/lib/axios";
import type { Inference } from "@/schemas/inference";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { columns } from "../data-table/columns/inference";
import { DataTable } from "../data-table/data-table";
import { Button } from "../ui/button";
import { toast } from "sonner";

function InferenceList() {
  const [selectedRows, setSelectedRows] = useState<Inference[]>([]);

  const navigate = useNavigate();
  const { projectId } = useParams({
    from: "/_authed/dashboard/project/$projectId/",
  });
  const { isPending, isError, data, error, refetch } = useQuery({
    queryKey: ["inferences"],
    queryFn: () => {
      return axios.get("api/inference/list", {
        withCredentials: true,
        params: {
          projectId,
        },
      });
    },
  });

  // Auto-refresh every 2 seconds if there are any processing inferences
  useEffect(() => {
    if (!data?.data?.inferences) return;

    const hasProcessingInferences = data.data.inferences.some(
      (inf: Inference) => inf.status === "processing" || inf.status === "pending"
    );

    if (hasProcessingInferences) {
      const interval = setInterval(() => {
        refetch();
      }, 2000); // Poll every 2 seconds

      return () => clearInterval(interval);
    }
  }, [data, refetch]);

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

  return (
    <>
      <DataTable
        data={inferences}
        columns={columns}
        onSelectionChange={setSelectedRows}
      >
        <Button
          className="h-8 cursor-pointer text-xs"
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
          className="h-8 cursor-pointer text-xs"
          variant="outline"
          disabled={selectedRows.length < 2}
          onClick={handleCompare}
        >
          Compare selected ({selectedRows.length})
        </Button>
        {/* TODO: add model filter input */}
      </DataTable>
    </>
  );
}

export { InferenceList };
