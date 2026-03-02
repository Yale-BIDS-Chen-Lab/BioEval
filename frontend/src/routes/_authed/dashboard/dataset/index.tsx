import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authed/dashboard/dataset/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { data, isPending, isError } = useQuery({
    queryKey: ["datasets-list"],
    queryFn: () => {
      return axios.get("api/dataset/list", {
        withCredentials: true,
      });
    },
  });

  if (isPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading datasets...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-destructive text-sm">Failed to load datasets. Please refresh the page.</p>
      </div>
    );
  }

  const datasets = data.data.datasets;
  const myDatasets = datasets.filter((d) => d.userOwned);

  function DatasetCard({ dataset }: { dataset: any }) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    // Refined, muted color coding for task types (softer contrast, premium feel)
    const taskColors: Record<string, string> = {
      "Multiple Choice Questions":
        "bg-sky-500/5 text-sky-600 dark:text-sky-400/90 border-sky-400/15 dark:border-sky-500/20",
      "Named-entity Recognition":
        "bg-emerald-500/5 text-emerald-600 dark:text-emerald-400/90 border-emerald-400/15 dark:border-emerald-500/20",
      "Relation Extraction":
        "bg-violet-500/5 text-violet-600 dark:text-violet-400/90 border-violet-400/15 dark:border-violet-500/20",
      "Multi-label Classification":
        "bg-amber-500/5 text-amber-600 dark:text-amber-400/90 border-amber-400/15 dark:border-amber-500/20",
      "Generation":
        "bg-rose-500/5 text-rose-600 dark:text-rose-400/90 border-rose-400/15 dark:border-rose-500/20",
    };

    const taskColorClass =
      taskColors[dataset.taskName] ||
      "bg-zinc-500/5 text-zinc-600 dark:text-zinc-400/90 border-zinc-400/15 dark:border-zinc-500/20";

    const deleteDatasetMutation = useMutation({
      mutationFn: async (datasetId: string) => {
        return axios.post(
          "/api/dataset/delete",
          { datasetId },
          { withCredentials: true }
        );
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["datasets-list"] });
        toast.success("Dataset deleted successfully");
        setShowDeleteDialog(false);
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || "Failed to delete dataset");
        setShowDeleteDialog(false);
      },
    });

    const handleDelete = () => {
      deleteDatasetMutation.mutate(dataset.datasetId);
    };

    return (
      <>
        <div
          key={dataset.datasetId}
          className="h-40 rounded-lg border bg-card px-6 py-5 shadow-sm transition-all hover:shadow-md hover:border-primary/50 relative"
        >
          <div
            className="cursor-pointer h-full"
            onClick={() => {
              navigate({
                to: "/dashboard/dataset/$datasetId",
                params: {
                  datasetId: dataset.datasetId,
                },
              });
            }}
          >
            <div className="flex h-full flex-col justify-between gap-4">
              <div className="space-y-2 overflow-hidden">
                <div className="text-lg font-semibold text-foreground">{dataset.name}</div>
                <div className="text-muted-foreground line-clamp-2 text-sm leading-relaxed">
                  {dataset.description}
                </div>
              </div>
              <div className="flex flex-row gap-2 flex-wrap">
                {!dataset.userOwned && (
                  <Badge variant="outline" className="border-primary/50 text-primary">
                    Official
                  </Badge>
                )}
                <Badge variant="outline" className={taskColorClass}>
                  {dataset.taskName}
                </Badge>
              </div>
            </div>
          </div>

          {dataset.userOwned && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="absolute bottom-3 right-3 p-1.5 rounded-md hover:bg-muted/80 transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="sm:max-w-[480px] p-6 sm:p-8">
            <DialogHeader className="space-y-4">
              <DialogTitle className="text-2xl font-semibold">
                Delete Dataset?
              </DialogTitle>
              <DialogDescription className="text-base leading-relaxed pt-3 pb-2">
                This will permanently delete the dataset "{dataset.name}" and all associated data.
                <br />
                <br />
                This includes:
                <br />
                • All inferences using this dataset
                <br />
                • All evaluations for those inferences
                <br />
                • All notes and highlights
                <br />
                • The dataset file from storage
                <br />
                <br />
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3 sm:gap-3 mt-8">
              <Button
                variant="outline"
                onClick={() => setShowDeleteDialog(false)}
                disabled={deleteDatasetMutation.isPending}
                className="flex-1 sm:flex-none px-6"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleteDatasetMutation.isPending}
                className="flex-1 sm:flex-none px-6"
              >
                {deleteDatasetMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="min-h-full bg-zinc-50 dark:bg-zinc-950/30">
      <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">My Datasets</h1>
        <Button
          variant="default"
          size="sm"
          className="cursor-pointer gap-1.5"
          onClick={() => {
            navigate({
              from: Route.fullPath,
              to: "./create",
            });
          }}
        >
          <Plus className="h-4 w-4" />
          New dataset
        </Button>
      </div>

      <div className="mb-12 grid grid-cols-3 gap-6">
        {myDatasets.length > 0 ? (
          myDatasets.map((d) => <DatasetCard dataset={d} />)
        ) : (
          <div className="col-span-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 bg-muted/10 p-12 text-center">
            <p className="text-muted-foreground mb-4 text-sm">You don't have any datasets yet.</p>
            <Button
              variant="default"
              className="h-9 cursor-pointer text-sm"
              onClick={() => {
                navigate({
                  from: Route.fullPath,
                  to: "./create",
                });
              }}
            >
              Create your first dataset
            </Button>
          </div>
        )}
      </div>

      <h2 className="mb-4 text-xl font-semibold tracking-tight">Public Datasets</h2>
      <div className="grid grid-cols-3 gap-6">
        {datasets
          .filter((d) => !d.userOwned)
          .map((d) => (
            <DatasetCard dataset={d} />
          ))}
      </div>
      </div>
    </div>
  );
}
