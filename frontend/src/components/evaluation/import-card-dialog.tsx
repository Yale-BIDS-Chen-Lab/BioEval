"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { axios } from "@/lib/axios";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CardBody } from "./evaluation-card-dialog";
import {
  buildEvaluationBody,
  buildInferenceBody,
  matchDataset,
  parseCard,
  type DatasetListItem,
} from "./import-card";

interface ImportCardDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportCardDialog({
  projectId,
  open,
  onOpenChange,
}: ImportCardDialogProps) {
  const queryClient = useQueryClient();
  const [rawText, setRawText] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const parsed = useMemo(
    () => (rawText.trim() ? parseCard(rawText) : null),
    [rawText]
  );
  const card = parsed && "card" in parsed ? parsed.card : null;

  const { data: datasetsData } = useQuery({
    queryKey: ["datasets"],
    enabled: open,
    queryFn: async () =>
      axios.get("api/dataset/list", { withCredentials: true }),
  });
  const datasets: DatasetListItem[] = datasetsData?.data?.datasets ?? [];
  const matched = card ? matchDataset(card, datasets) : null;

  const reset = () => {
    setRawText("");
    setIsImporting(false);
  };
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    file
      .text()
      .then(setRawText)
      .catch(() => toast.error("Could not read the file."));
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!card || !matched) return;
    setIsImporting(true);
    try {
      const infRes = await axios.post(
        "api/inference/create",
        buildInferenceBody(card, matched.datasetId, projectId),
        { withCredentials: true }
      );
      const inferenceId: string | undefined = infRes.data?.created?.[0];
      if (!inferenceId) {
        toast.error("Import failed: no inference was created.");
        return;
      }
      try {
        await axios.post(
          "api/evaluation/create",
          buildEvaluationBody(card, inferenceId, projectId),
          { withCredentials: true }
        );
        toast.success("Imported — the run is starting.");
        queryClient.invalidateQueries({ queryKey: ["inferences", projectId] });
        handleOpenChange(false);
      } catch (evalErr: any) {
        queryClient.invalidateQueries({ queryKey: ["inferences", projectId] });
        toast.error(
          `The inference was created, but its evaluation failed: ${
            evalErr?.response?.data?.error ?? "unknown error"
          }. Add it from the dashboard or delete the inference.`
        );
      }
    } catch (infErr: any) {
      const status = infErr?.response?.status;
      const err = infErr?.response?.data?.error;
      if (status === 422) {
        toast.error(
          `No integration configured for provider "${card.model.provider}" — set it up in Settings, then import again.`
        );
      } else {
        toast.error(err ?? "Failed to create the inference.");
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="space-y-1 border-b px-6 py-4 text-left">
          <DialogTitle>Import evaluation card</DialogTitle>
          <p className="text-muted-foreground text-sm">
            Paste or upload a card JSON to recreate its inference + evaluation
            and run it.
          </p>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex items-center gap-2">
            <label className="cursor-pointer">
              <input
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={onFile}
              />
              <span className="border-input hover:bg-muted inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm">
                <Upload className="h-4 w-4" /> Upload .json
              </span>
            </label>
            <span className="text-muted-foreground text-xs">or paste below</span>
          </div>

          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder='{ "bioeval": { … }, "dataset": { … }, … }'
            className="border-input h-28 w-full rounded-md border p-2 font-mono text-xs"
          />

          {parsed && "error" in parsed && (
            <p className="text-destructive text-sm">{parsed.error}</p>
          )}

          {card && (
            <>
              <div className="rounded-md border p-4">
                <CardBody card={card} />
              </div>
              {matched ? (
                <p className="text-sm">
                  Will use your dataset{" "}
                  <span className="font-medium">{matched.name}</span> (
                  {matched.taskName}).
                </p>
              ) : (
                <p className="text-destructive text-sm">
                  No dataset named "{card.dataset.name}" ({card.dataset.task.name}
                  ) found in your workspace — upload it first, then import again.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!card || !matched || isImporting}
          >
            {isImporting ? "Importing…" : "Import & run"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
