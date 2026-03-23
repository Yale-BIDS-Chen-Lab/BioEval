import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ParsingFunctionArgumnets, ParsingParameter } from "../schemas/parsing";
import { Status } from "../types/inference";
import { InferenceArguments, InferenceParameter } from "../schemas/provider";
import { IntegrationArguments } from "../schemas/user";
import { JSONSchema } from "zod/v4/core";
import { z } from "zod";

// TODO: evaluate pros/cons of using both a surrogate PK and a public-facing UUID on each table
// Auth tables generated with 'drizzle-kit pull' to match the schema created by better-auth's migration process.

export const user = pgTable(
  "user",
  {
    id: text().primaryKey().notNull(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull(),
    image: text(),
    createdAt: timestamp({ mode: "string" }).notNull(),
    updatedAt: timestamp({ mode: "string" }).notNull(),
  },
  (table) => [unique("user_email_key").on(table.email)]
);

export const session = pgTable(
  "session",
  {
    id: text().primaryKey().notNull(),
    expiresAt: timestamp({ mode: "string" }).notNull(),
    token: text().notNull(),
    createdAt: timestamp({ mode: "string" }).notNull(),
    updatedAt: timestamp({ mode: "string" }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "session_userId_fkey",
    }),
    unique("session_token_key").on(table.token),
  ]
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey().notNull(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ mode: "string" }),
    refreshTokenExpiresAt: timestamp({ mode: "string" }),
    scope: text(),
    password: text(),
    createdAt: timestamp({ mode: "string" }).notNull(),
    updatedAt: timestamp({ mode: "string" }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "account_userId_fkey",
    }),
  ]
);

export const verification = pgTable("verification", {
  id: text().primaryKey().notNull(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp({ mode: "string" }).notNull(),
  createdAt: timestamp({ mode: "string" }),
  updatedAt: timestamp({ mode: "string" }),
});

export const project = pgTable(
  "project",
  {
    id: serial().primaryKey(),
    projectId: text().notNull().unique(),
    name: text().notNull(),

    userId: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "project_userId_fkey",
    }),
  ]
);

// TODO: id should probably be text
export const task = pgTable("task", {
  id: text().primaryKey(),
  name: text().notNull(),
});

// TODO: find a way to init defaults later. will probably occur in ci/cd pipeline
export const dataset = pgTable(
  "dataset",
  {
    id: serial().primaryKey(),
    datasetId: text().notNull().unique(),
    name: text().notNull(),
    description: text(),
    defaultPrompt: text().notNull(),
    taskId: text().notNull(),
    objectKey: text().notNull(),
    isPublic: boolean().notNull(),
    classes: jsonb(),
    ownerId: text(),
  },
  (table) => [
    foreignKey({
      columns: [table.ownerId],
      foreignColumns: [user.id],
      name: "dataset_userId_fkey",
    }),
    foreignKey({
      columns: [table.taskId],
      foreignColumns: [task.id],
      name: "dataset_task_fkey",
    }),
  ]
);

export const model = pgTable(
  "model",
  {
    id: serial().primaryKey(),
    name: text().notNull().unique(),
    providerId: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.providerId],
      foreignColumns: [provider.providerId],
      name: "model_provider_fkey",
    }),
  ]
);

export const provider = pgTable("provider", {
  id: serial().primaryKey(),
  providerId: text().notNull().unique(),
  name: text().notNull(),
  parameters: jsonb().$type<InferenceParameter[]>().notNull(),
});

// TODO: prompt can be made separate table
export const inference = pgTable(
  "inference",
  {
    id: serial().primaryKey(),
    inferenceId: text().notNull().unique(),
    taskId: text().notNull(),
    datasetId: text().notNull(),
    prompt: text().notNull(),
    model: text().notNull(), // name, could be ID in future
    providerId: text().notNull(),
    parameters: jsonb().$type<InferenceArguments>().notNull(),
    status: text().notNull(),
    objectKey: text(), // s3 key of output
    userId: text().notNull(),
    projectId: text().notNull(),
    isFavorite: boolean().notNull().default(false),
    totalExamples: integer(), // total number of examples to process
    processedExamples: integer(), // number of examples processed so far
    createdAt: timestamp({ mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.datasetId],
      foreignColumns: [dataset.datasetId],
      name: "inference_dataset_fkey",
    }),
    foreignKey({
      columns: [table.taskId],
      foreignColumns: [task.id],
      name: "inference_task_fkey",
    }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "inference_userId_fkey",
    }),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [project.projectId],
      name: "inference_projectId_fkey",
    }),
    foreignKey({
      columns: [table.providerId],
      foreignColumns: [provider.providerId],
      name: "inference_providerId_fkey",
    }),
  ]
);

export const evaluation = pgTable(
  "evaluation",
  {
    id: serial().primaryKey(),
    evaluationId: text().notNull().unique(),
    status: text().notNull(), // status could also be on a metric basis
    objectKey: text(), // s3 key of output
    metrics: jsonb().notNull(),
    parsingFunctions: jsonb().$type<ParsingFunctionArgumnets>(),
    llmJudgeConfig: jsonb(),
    inferenceId: text().notNull(),
    userId: text().notNull(),
    projectId: text().notNull(),
    createdAt: timestamp({ mode: "string" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "evaluation_userId_fkey",
    }),
    foreignKey({
      columns: [table.inferenceId],
      foreignColumns: [inference.inferenceId],
      name: "evaluation_inferenceId_fkey",
    }),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [project.projectId],
      name: "evaluation_projectId_fkey",
    }),
  ]
);

export const metric = pgTable(
  "metric",
  {
    id: serial().primaryKey(),
    metricId: text().notNull(),
    name: text().notNull(),
    taskId: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.taskId],
      foreignColumns: [task.id],
      name: "metric_task_fkey",
    }),
  ]
);

export const parsingFunction = pgTable("parsing_function", {
  id: serial().primaryKey(),
  funcId: text().notNull(),
  name: text().notNull(),
  // TODO: add description field
  parameters: jsonb().$type<ParsingParameter[]>().notNull(),
  code: text(), // Python implementation code to show users
  isCustom: boolean().default(false), // true if user-created
  userId: text(), // owner if custom function
});

export const integration = pgTable(
  "integration",
  {
    id: serial().primaryKey(),
    providerId: text().notNull(),
    schema: jsonb().$type<JSONSchema.BaseSchema>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.providerId],
      foreignColumns: [provider.providerId],
      name: "integration_provider_fkey",
    }),
  ]
);

export const integrationConfig = pgTable(
  "config",
  {
    id: serial().primaryKey(),
    settings: jsonb().notNull(),
    providerId: text().notNull(),
    userId: text().notNull(),
  },
  (table) => ({
    fkProvider: foreignKey({
      columns: [table.providerId],
      foreignColumns: [provider.providerId],
      name: "config_provider_fkey",
    }),
    fkUser: {
      columns: [table.userId],
      foreignColumns: [user.id],
      name: "config_user_fkey",
    },
    uniqProviderUser: uniqueIndex("config_provider_user_unique").on(
      table.providerId,
      table.userId
    ),
  })
);

export const note = pgTable(
  "note",
  {
    id: serial().primaryKey(),
    rowId: text().notNull(),
    content: text().notNull(),
    inferenceId: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.inferenceId],
      foreignColumns: [inference.inferenceId],
      name: "note_inference_fkey",
    }),
    uniqueIndex("note_inference_row_unique").on(table.inferenceId, table.rowId),
  ]
);

export const highlight = pgTable(
  "highlight",
  {
    id: serial().primaryKey(),
    rowId: text().notNull(),
    start: integer().notNull(),
    end: integer().notNull(),
    inferenceId: text().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.inferenceId],
      foreignColumns: [inference.inferenceId],
      name: "highlight_inference_fkey",
    }),
    uniqueIndex("highlight_inference_row_unique").on(
      table.inferenceId,
      table.rowId
    ),
  ]
);

export const humanScore = pgTable(
  "human_score",
  {
    id: serial().primaryKey(),
    evaluationId: text().notNull(),
    rowId: text().notNull(),
    score: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.evaluationId],
      foreignColumns: [evaluation.evaluationId],
      name: "human_score_evaluation_fkey",
    }),
    uniqueIndex("human_score_evaluation_row_unique").on(
      table.evaluationId,
      table.rowId
    ),
  ]
);

export type NewProject = typeof project.$inferInsert;
export type NewInference = typeof inference.$inferInsert & {
  status: Status;
};
export type NewEvaluation = typeof evaluation.$inferInsert & {
  metrics: string[];
};
export type NewDataset = typeof dataset.$inferInsert;
export type NewParsingFunction = typeof parsingFunction.$inferInsert;
export type NewProvider = typeof provider.$inferInsert;
