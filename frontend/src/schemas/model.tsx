import { z } from "zod";

export const addModelSchema = z.object({
  provider: z.string().nonempty(),
  model: z.string().nonempty(),
});
