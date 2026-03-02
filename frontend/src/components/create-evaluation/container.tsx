import { z } from "zod";
import { MultiStepForm } from "./multi-step";
import { SelectMetrics } from "./select-metrics";
import { useMutation, useQuery } from "@tanstack/react-query";
import { axios } from "@/lib/axios";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { SelectParsingFunctions } from "./select-parsing";

const schema = z.object({
  metrics: z.array(z.string()).nonempty(),
  parsingFunctions: z.array(
    z.object({
      id: z.string(),
      arguments: z.array(z.object({ id: z.string(), value: z.any() })),
    }),
  ),
  llmJudgeConfig: z.record(z.any()).optional(),
});

export function Container({
  projectId,
  inferenceId,
}: {
  projectId: string;
  inferenceId: string;
}) {
  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      axios.post(
        "api/evaluation/create",
        { ...values, projectId, inferenceId },
        { withCredentials: true },
      ),
    onSuccess: () => {
      navigate({
        to: "/dashboard/project/$projectId/inference/$inferenceId/evaluation",
        params: { projectId, inferenceId },
        reloadDocument: true,
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data.error);
    },
  });

  const { data, isPending, isError, error } = useQuery({
    queryKey: ["create-eval-options", projectId],
    queryFn: () =>
      axios.get("api/evaluation/options", {
        withCredentials: true,
        params: { projectId },
      }),
  });

  if (isPending || isError) {
    return <></>;
  }

  const inferences = data.data.inferences;
  const tasks = data.data.tasks;
  const selectedInference = inferences.find(
    (inf: any) => inf.inferenceId === inferenceId,
  );
  const taskId = selectedInference?.taskId;

  // Filter out internal/basic parsing functions from UI (but keep them in DB for backward compatibility)
  const filteredParsingFunctions = data.data.parsingFunctions.filter((fn: any) => 
    !['extract_first_character', 'extract_first_word', 'process_mcq_option'].includes(fn.taskId)
  );

  // Default parsing functions for MLC and NER tasks
  const defaultParsingFunctions = (() => {
    // NER tasks: automatically use extract_ner_spans
    if (taskId === "ner") {
      return [{
        id: "extract_ner_spans",
        arguments: [],
      }];
    }
    
    // MLC tasks with classes
    if (taskId === "mlc" && selectedInference?.classes?.length > 0) {
      const datasetName = selectedInference?.dataset?.toLowerCase() || "";
      
      // Check for dataset-specific parsing functions
      if (datasetName.includes("hoc")) {
        return [{
          id: "process_mlc_option_hoc",
          arguments: [],
        }];
      } else if (datasetName.includes("litcovid") || datasetName.includes("covid")) {
        return [{
          id: "process_mlc_option_litcovid",
          arguments: [],
        }];
      }
      
      // Fallback to generic process_mlc_option
      return [{
        id: "process_mlc_option",
        arguments: [
          { id: "labels", value: selectedInference.classes.join(",") },
        ],
      }];
    }
    return [];
  })();

  return (
    <MultiStepForm
      schema={schema}
      defaultValues={{ metrics: [], parsingFunctions: defaultParsingFunctions, llmJudgeConfig: {} }}
      submitting={mutation.isPending}
      onSubmit={(v) => mutation.mutateAsync(v)}
      steps={[
        {
          id: "parsing-fns",
          render: (form) => (
            <SelectParsingFunctions
              form={form}
              parsingFunctions={filteredParsingFunctions}
            />
          ),
          fields: ["parsingFunctions"],
        },
        {
          id: "metrics",
          render: (form) => (
            <SelectMetrics
              metrics={tasks[taskId].metrics}
              form={form}
              llmJudgeConfig={form.watch("llmJudgeConfig")}
            />
          ),
          fields: ["metrics", "llmJudgeConfig"],
        },
      ]}
    />
  );
}
