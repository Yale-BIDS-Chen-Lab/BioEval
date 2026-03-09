import { z } from "zod/v4";

// TODO: add server-side validation for model/provider parameters
export const createInferenceSchema = z.object({
  datasetId: z.string().nonempty(),
  prompt: z.string().nonempty(),
  models: z
    .array(
      z.object({
        model: z.string().nonempty(),
        provider: z.string().nonempty(),
        parameters: z.array(
          z.object({
            id: z.string(),
            value: z.any(),
          })
        ),
      })
    )
    .nonempty(),
  projectId: z.string().nonempty(),
});

export const getInferencesSchema = z.object({
  projectId: z.string().nonempty(),
});

export const editNoteSchema = z.object({
  inferenceId: z.string().nonempty(),
  notes: z.array(
    z.object({
      rowId: z.string(),
      content: z.string(),
    })
  ),
});

export const editHighlightSchema = z.object({
  inferenceId: z.string().nonempty(),
  highlights: z
    .array(
      z
        .object({
          rowId: z.string().nonempty(),
          start: z.number().int().min(0),
          end: z.number().int().min(0),
        })
        .refine((v) => v.end >= v.start, {
          message: "end must be >= start",
          path: ["end"],
        })
    )
    .min(1),
});

export const dataviewSchema = z.object({
  inferenceId: z.string().nonempty(),
});

export const compareSchema = z.object({
  inferenceIds: z.array(z.string().nonempty()).nonempty(),
  evaluationIds: z.array(z.string().nonempty()).optional(),
}).refine(
  (data) =>
    data.evaluationIds === undefined ||
    data.evaluationIds.length === data.inferenceIds.length,
  {
    message: "evaluationIds length must match inferenceIds length",
    path: ["evaluationIds"],
  }
);
