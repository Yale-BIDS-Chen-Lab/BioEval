import { z } from "zod/v4";
import { parsingFunctionArguments } from "./parsing";

export const createEvaluationSchema = z.object({
  inferenceId: z.string().nonempty(),
  metrics: z.array(z.string()).nonempty(),
  projectId: z.string().nonempty(),
  parsingFunctions: parsingFunctionArguments,
  llmJudgeConfig: z.record(z.string(), z.any()).optional(),
});

export const getEvaluationOptionsSchema = z.object({
  projectId: z.string().nonempty(),
});

export const getEvaluationsSchema = z.object({
  projectId: z.string().nonempty(),
  inferenceId: z.string().nonempty(),
});

export const dataviewSchema = z.object({
  evaluationId: z.string().nonempty(),
});

export const deleteEvaluationSchema = z.object({
  evaluationId: z.string().nonempty(),
});
