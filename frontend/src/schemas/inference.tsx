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
});

export type Inference = z.infer<typeof inferenceSchema>;
