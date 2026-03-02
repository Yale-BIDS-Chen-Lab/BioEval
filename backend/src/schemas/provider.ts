import { z } from "zod/v4";
import { JSONSchema } from "zod/v4/core";

export interface InferenceParameter {
  id: string;
  name: string;
  schema: JSONSchema.BaseSchema;
  defaultValue: string | number | boolean;
  description: string;
}

export const inferenceArguments = z.array(
  z.object({
    id: z.string(),
    value: z.any(),
  })
);

export type InferenceArguments = z.infer<typeof inferenceArguments>;
