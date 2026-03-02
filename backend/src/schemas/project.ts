import { z } from "zod/v4";

const createProjectSchema = z.object({
  name: z.string().nonempty(),
});

export { createProjectSchema };
