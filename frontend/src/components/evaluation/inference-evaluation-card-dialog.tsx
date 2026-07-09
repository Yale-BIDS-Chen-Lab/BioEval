"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Download, FileText } from "lucide-react";

import { axios } from "@/lib/axios";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  EvaluationCardSections,
  downloadCardJson,
  useEvaluationCard,
} from "./evaluation-card-dialog";

interface InferenceEvaluationCardDialogProps {
  inferenceId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type EvaluationListItem = {
  evaluationId: string;
  status?: string;
  metrics?: string[];
};

export function InferenceEvaluationCardDialog({
  inferenceId,
  projectId,
  open,
  onOpenChange,
}: InferenceEvaluationCardDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    data: listData,
    isLoading: listLoading,
    isError: listError,
  } = useQuery({
    queryKey: ["evaluations", projectId, inferenceId],
    enabled: open,
    retry: false,
    queryFn: () =>
      axios.get("api/evaluation/list", {
        withCredentials: true,
        params: { projectId, inferenceId },
      }),
  });

  const evaluations: EvaluationListItem[] = listData?.data?.evaluations ?? [];
  // With exactly one evaluation, skip the picker and show it directly.
  const effectiveId =
    selectedId ??
    (evaluations.length === 1 ? evaluations[0].evaluationId : null);
  const multiple = evaluations.length > 1;

  const {
    data: card,
    isLoading: cardLoading,
    isError: cardError,
  } = useEvaluationCard(effectiveId, open && !!effectiveId);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) setSelectedId(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[600px]">
        <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>Evaluation card</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Reproducible recipe — the configuration needed to re-run this
            evaluation.
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          {listLoading && (
            <div className="space-y-3">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!listLoading && listError && (
            <p className="text-muted-foreground text-sm">
              Could not load this inference's evaluations.
            </p>
          )}

          {!listLoading && !listError && evaluations.length === 0 && (
            <p className="text-muted-foreground text-sm">
              This inference has no evaluations yet. Open it and create one first
              — you don't need to wait for it to finish.
            </p>
          )}

          {!listLoading && !listError && evaluations.length > 0 && !effectiveId && (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">
                This inference has {evaluations.length} evaluations. Pick one to
                view its card:
              </p>
              <ul className="space-y-1.5">
                {evaluations.map((ev) => (
                  <li key={ev.evaluationId}>
                    <button
                      onClick={() => setSelectedId(ev.evaluationId)}
                      className="hover:bg-muted flex w-full flex-col items-start gap-1 rounded-md border px-3 py-2 text-left transition"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="font-mono text-xs">
                          {ev.evaluationId}
                        </span>
                        {ev.status && (
                          <span className="text-muted-foreground text-xs">
                            {ev.status}
                          </span>
                        )}
                      </div>
                      {Array.isArray(ev.metrics) && ev.metrics.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {ev.metrics.slice(0, 4).map((m) => (
                            <Badge key={m} variant="secondary">
                              {m}
                            </Badge>
                          ))}
                          {ev.metrics.length > 4 && (
                            <span className="text-muted-foreground text-xs">
                              +{ev.metrics.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {effectiveId && (
            <div className="space-y-5">
              <EvaluationCardSections
                card={card}
                isLoading={cardLoading}
                isError={cardError}
              />
            </div>
          )}
        </div>

        <DialogFooter className="items-center border-t px-6 py-4 sm:justify-between">
          <div>
            {effectiveId && multiple && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedId(null)}
              >
                <ChevronLeft className="mr-1 h-4 w-4" />
                Choose another
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Close
            </Button>
            {effectiveId && (
              <Button
                onClick={() => downloadCardJson(card, effectiveId)}
                disabled={!card}
              >
                <Download className="mr-2 h-4 w-4" />
                Download JSON
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function InferenceEvaluationCardButton({
  inferenceId,
  projectId,
}: {
  inferenceId: string;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        title="Evaluation card"
        onClick={() => setOpen(true)}
        className="flex h-[64px] w-[68px] shrink-0 flex-col items-center justify-center gap-1 p-0"
      >
        <FileText className="h-4 w-4" />
        <span className="text-[11px] font-medium leading-none">Card</span>
      </Button>
      <InferenceEvaluationCardDialog
        inferenceId={inferenceId}
        projectId={projectId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
