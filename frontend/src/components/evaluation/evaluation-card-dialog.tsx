"use client";

import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface EvaluationCardDialogProps {
  evaluationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-start gap-3">
      <div className="text-muted-foreground font-medium">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function EvaluationCardDialog({
  evaluationId,
  open,
  onOpenChange,
}: EvaluationCardDialogProps) {
  const { data: card, isLoading, isError } = useQuery({
    queryKey: ["evaluation-card", evaluationId],
    enabled: open,
    queryFn: async () => {
      try {
        const res = await axios.get("api/evaluation/card", {
          params: { evaluationId },
          withCredentials: true,
        });
        return res.data as any;
      } catch (err: any) {
        toast.error(err?.response?.data?.error ?? "Failed to load the evaluation card.");
        throw err;
      }
    },
  });

  const downloadJson = () => {
    if (!card) return;
    const a = document.createElement("a");
    const file = new Blob([JSON.stringify(card, null, 2)], {
      type: "application/json",
    });
    a.href = URL.createObjectURL(file);
    a.download = `evaluation-card-${evaluationId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Evaluation card</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-5 w-56" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="text-muted-foreground text-sm">
            Could not load the evaluation card.
          </p>
        )}

        {card && (
          <div className="space-y-4 text-sm">
            <Row label="Dataset">
              <span className="font-medium">{card.dataset?.name}</span>
              <span className="text-muted-foreground"> · {card.dataset?.task?.name}</span>
            </Row>
            <Separator />
            <Row label="Prompt">
              <pre className="bg-muted max-h-40 overflow-auto rounded-md p-3 font-mono text-xs whitespace-pre-wrap">
                {card.prompt?.template}
              </pre>
            </Row>
            <Separator />
            <Row label="Model">
              <div>
                <span className="font-medium">{card.model?.identifier}</span>{" "}
                <span className="text-muted-foreground">({card.model?.provider})</span>
              </div>
              {Array.isArray(card.model?.parameters) && card.model.parameters.length > 0 && (
                <div className="text-muted-foreground mt-1 text-xs">
                  {card.model.parameters
                    .map((p: any) => `${p.id} = ${p.value}`)
                    .join(" · ")}
                </div>
              )}
            </Row>
            <Separator />
            <Row label="Evaluation">
              <div className="flex flex-wrap gap-1">
                {(card.evaluation?.metrics ?? []).map((m: string) => (
                  <Badge key={m} variant="secondary">
                    {m}
                  </Badge>
                ))}
              </div>
              {Array.isArray(card.evaluation?.parsingFunctions) &&
                card.evaluation.parsingFunctions.length > 0 && (
                  <div className="text-muted-foreground mt-2 text-xs">
                    parsing:{" "}
                    {card.evaluation.parsingFunctions
                      .map((f: any) => f.id)
                      .join(", ")}
                  </div>
                )}
              {card.evaluation?.llmJudge && (
                <div className="text-muted-foreground mt-1 text-xs">
                  LLM judge: {card.evaluation.llmJudge.model ?? "—"}
                  {card.evaluation.llmJudge.scale
                    ? ` · scale ${card.evaluation.llmJudge.scale}`
                    : ""}
                </div>
              )}
            </Row>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={downloadJson} disabled={!card}>
            <Download className="mr-2 h-4 w-4" />
            Download JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
