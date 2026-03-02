import { ParquetSchema } from "parquetjs";
import { z } from "zod/v4";

export const getDatasetSchema = z.object({
  datasetId: z.string().nonempty(),
});

export const uploadDatasetSchema = z.object({
  datasetFile: z
    .any()
    .refine((f) => f && typeof f === "object" && Buffer.isBuffer(f.buffer)),
  name: z.string().nonempty(),
  taskId: z.string().nonempty(),
  description: z.string().nonempty(),
  defaultPrompt: z.string().nonempty().includes("{{input}}"),
  classes: z.array(z.string()).optional(),
});

export const datasetRowSchema = z
  .object({
    id: z.string().nonempty(),
    input_raw: z.string().nonempty(),
    reference: z.string().nonempty(),
  })
  .strip();

export const datasetRowParquetSchema = new ParquetSchema({
  id: { type: "UTF8" },
  input: { type: "UTF8" },
  reference: { type: "UTF8" },
});
