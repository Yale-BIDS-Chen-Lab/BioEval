import { z } from "zod/v4";
import { JSONSchema } from "zod/v4/core";

export interface ParsingParameter {
  id: string;
  name: string;
  schema: JSONSchema.BaseSchema;
}

export const parsingFunctionArguments = z.array(
  z.object({
    id: z.string(),
    arguments: z.array(
      z.object({
        id: z.string(),
        value: z.any(),
      })
    ),
  })
);

export type ParsingFunctionArgumnets = z.infer<typeof parsingFunctionArguments>;
