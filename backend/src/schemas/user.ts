import { z } from "zod/v4";
import { JSONSchema } from "zod/v4/core";

export interface IntegrationParameter {
  id: string;
  name: string;
  schema: JSONSchema.BaseSchema;
}

export const integrationsArguments = z.record(z.string(), z.string());

export type IntegrationArguments = z.infer<typeof integrationsArguments>;
