"use client";

import { type Row } from "@tanstack/react-table";
import { MoreHorizontal, Trash2, Copy, Star, XCircle } from "lucide-react";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
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
import { axios } from "@/lib/axios";

interface DataTableRowActionsProps<TData> {
  row: Row<TData>;
  type?: "inference" | "evaluation";
}

export function DataTableRowActions<TData>({
  row,
  type = "inference",
}: DataTableRowActionsProps<TData>) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();

  const inferenceId = (row.original as any).inferenceId;
  const evaluationId = (row.original as any).evaluationId;
  const isFavorite = (row.original as any).isFavorite || false;
  const status = (row.original as any).status;
  
  const isEvaluation = type === "evaluation";

  const cancelMutation = useMutation({
    mutationFn: () =>
      axios.post(
        "api/inference/cancel",
        { inferenceId },
        { withCredentials: true }
      ),
    onSuccess: () => {
      toast.success("Inference canceled successfully");
      queryClient.invalidateQueries({ queryKey: ["inferences"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to cancel inference");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (isEvaluation) {
        return axios.delete(
          "api/evaluation/delete",
          { 
            data: { evaluationId },
            withCredentials: true 
          }
        );
      } else {
        return axios.post(
          "api/inference/delete",
          { inferenceId },
          { withCredentials: true }
        );
      }
    },
    onSuccess: () => {
      toast.success(`${isEvaluation ? "Evaluation" : "Inference"} deleted successfully`);
      setShowDeleteDialog(false);
      if (isEvaluation) {
        queryClient.invalidateQueries({ queryKey: ["evaluations"] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["inferences"] });
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || `Failed to delete ${isEvaluation ? "evaluation" : "inference"}`);
    },
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      axios.post(
        "api/inference/copy",
        { inferenceId },
        { withCredentials: true }
      ),
    onSuccess: () => {
      toast.success("Inference copied successfully");
      queryClient.invalidateQueries({ queryKey: ["inferences"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to copy inference");
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: (isFavorite: boolean) =>
      axios.post(
        "api/inference/toggle-favorite",
        { inferenceId, isFavorite },
        { withCredentials: true }
      ),
    onSuccess: (_data: any, isFavorite: boolean) => {
      toast.success(isFavorite ? "Added to favorites" : "Removed from favorites");
      queryClient.invalidateQueries({ queryKey: ["inferences"] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Failed to update favorite");
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <MoreHorizontal />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[180px]">
          {!isEvaluation && <DropdownMenuItem disabled>Edit</DropdownMenuItem>}
          {!isEvaluation && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => copyMutation.mutate()}
              disabled={copyMutation.isPending}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copyMutation.isPending ? "Copying..." : "Make a copy"}
            </DropdownMenuItem>
          )}
          {!isEvaluation && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => favoriteMutation.mutate(!isFavorite)}
              disabled={favoriteMutation.isPending}
            >
              <Star className={`mr-2 h-4 w-4 ${isFavorite ? "fill-yellow-400 text-yellow-400" : ""}`} />
              {isFavorite ? "Unfavorite" : "Favorite"}
            </DropdownMenuItem>
          )}
          {!isEvaluation && <DropdownMenuSeparator />}
          {!isEvaluation && (status === "pending" || status === "processing") && (
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" />
              {cancelMutation.isPending ? "Canceling..." : "Cancel"}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-destructive focus:text-destructive cursor-pointer"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
            <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[480px] p-6 sm:p-8">
          <DialogHeader className="space-y-4">
            <DialogTitle className="text-2xl font-semibold">
              Delete {isEvaluation ? "Evaluation" : "Inference"}?
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed pt-3 pb-2">
              {isEvaluation ? (
                <>
                  This will permanently delete this evaluation.
                  <br />
                  <br />
                  The associated inference and its results will not be affected.
                </>
              ) : (
                <>
                  This will permanently delete this inference and all associated data including evaluations and notes.
                  <br />
                  <br />
                  This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 sm:gap-3 mt-8">
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteDialog(false)}
              className="flex-1 sm:flex-none px-6"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="flex-1 sm:flex-none px-6"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
