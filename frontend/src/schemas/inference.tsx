import { CheckCircle, CircleOff, ClockFading, Timer, XCircle } from "lucide-react";
import { z } from "zod";

export const statuses = [
  {
    value: "pending",
    label: "Pending",
    icon: ClockFading,
  },
  {
    value: "processing",
    label: "Processing",
    icon: Timer,
  },
  {
    value: "done",
    label: "Done",
    icon: CheckCircle,
  },
  {
    value: "failed",
    label: "Failed",
    icon: XCircle,
  },
  {
    value: "canceled",
    label: "Canceled",
    icon: CircleOff,
  },
];

export const inferenceSchema = z.object({
  inferenceId: z.string().nonempty(),
  model: z.string().nonempty(),
  providerId: z.string().nonempty(),
  status: z.enum(["pending", "processing", "done", "failed", "canceled"]),
  isFavorite: z.boolean().optional(),
  createdAt: z.string().nullable().optional(),
  task: z.string().optional(),
  datasetId: z.string().optional(),
  dataset: z.string().optional(),
  totalExamples: z.number().nullable().optional(),
  processedExamples: z.number().nullable().optional(),
  datasetPlacement: z
    .object({
      tier: z.enum(["gold", "silver", "bronze"]),
      metricKey: z.string().nonempty(),
      value: z.number(),
    })
    .nullable()
    .optional(),
  evaluationSummary: z
    .object({
      count: z.number(),
      hasRunningEvaluations: z.boolean(),
      latestCompleted: z
        .object({
          evaluationId: z.string().nonempty(),
          createdAt: z.string().nullable(),
          metrics: z.array(z.string()),
          aggregate: z.record(z.string(), z.number()),
        })
        .nullable(),
      primaryMetricBest: z
        .object({
          metricKey: z.string().nonempty(),
          value: z.number(),
        })
        .nullable()
        .optional(),
    })
    .optional(),
});

export type Inference = z.infer<typeof inferenceSchema>;
