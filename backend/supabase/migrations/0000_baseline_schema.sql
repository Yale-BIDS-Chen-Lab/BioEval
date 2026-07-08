CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset" (
	"id" serial PRIMARY KEY NOT NULL,
	"datasetId" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"defaultPrompt" text NOT NULL,
	"taskId" text NOT NULL,
	"objectKey" text NOT NULL,
	"isPublic" boolean NOT NULL,
	"classes" jsonb,
	"ownerId" text,
	CONSTRAINT "dataset_datasetId_unique" UNIQUE("datasetId")
);
--> statement-breakpoint
CREATE TABLE "evaluation" (
	"id" serial PRIMARY KEY NOT NULL,
	"evaluationId" text NOT NULL,
	"status" text NOT NULL,
	"objectKey" text,
	"metrics" jsonb NOT NULL,
	"parsingFunctions" jsonb,
	"llmJudgeConfig" jsonb,
	"inferenceId" text NOT NULL,
	"userId" text NOT NULL,
	"projectId" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_evaluationId_unique" UNIQUE("evaluationId")
);
--> statement-breakpoint
CREATE TABLE "highlight" (
	"id" serial PRIMARY KEY NOT NULL,
	"rowId" text NOT NULL,
	"start" integer NOT NULL,
	"end" integer NOT NULL,
	"inferenceId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_score" (
	"id" serial PRIMARY KEY NOT NULL,
	"evaluationId" text NOT NULL,
	"rowId" text NOT NULL,
	"score" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inference" (
	"id" serial PRIMARY KEY NOT NULL,
	"inferenceId" text NOT NULL,
	"taskId" text NOT NULL,
	"datasetId" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"providerId" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"status" text NOT NULL,
	"objectKey" text,
	"userId" text NOT NULL,
	"projectId" text NOT NULL,
	"isFavorite" boolean DEFAULT false NOT NULL,
	"totalExamples" integer,
	"processedExamples" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inference_inferenceId_unique" UNIQUE("inferenceId")
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" text NOT NULL,
	"schema" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"id" serial PRIMARY KEY NOT NULL,
	"settings" jsonb NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric" (
	"id" serial PRIMARY KEY NOT NULL,
	"metricId" text NOT NULL,
	"name" text NOT NULL,
	"taskId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"providerId" text NOT NULL,
	CONSTRAINT "model_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" serial PRIMARY KEY NOT NULL,
	"rowId" text NOT NULL,
	"content" text NOT NULL,
	"inferenceId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parsing_function" (
	"id" serial PRIMARY KEY NOT NULL,
	"funcId" text NOT NULL,
	"name" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"code" text,
	"isCustom" boolean DEFAULT false,
	"userId" text
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" serial PRIMARY KEY NOT NULL,
	"projectId" text NOT NULL,
	"name" text NOT NULL,
	"userId" text NOT NULL,
	CONSTRAINT "project_projectId_unique" UNIQUE("projectId")
);
--> statement-breakpoint
CREATE TABLE "provider" (
	"id" serial PRIMARY KEY NOT NULL,
	"providerId" text NOT NULL,
	"name" text NOT NULL,
	"parameters" jsonb NOT NULL,
	CONSTRAINT "provider_providerId_unique" UNIQUE("providerId")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean NOT NULL,
	"image" text,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "user_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_userId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_task_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_inferenceId_fkey" FOREIGN KEY ("inferenceId") REFERENCES "public"."inference"("inferenceId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation" ADD CONSTRAINT "evaluation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlight" ADD CONSTRAINT "highlight_inference_fkey" FOREIGN KEY ("inferenceId") REFERENCES "public"."inference"("inferenceId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_score" ADD CONSTRAINT "human_score_evaluation_fkey" FOREIGN KEY ("evaluationId") REFERENCES "public"."evaluation"("evaluationId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference" ADD CONSTRAINT "inference_dataset_fkey" FOREIGN KEY ("datasetId") REFERENCES "public"."dataset"("datasetId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference" ADD CONSTRAINT "inference_task_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference" ADD CONSTRAINT "inference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference" ADD CONSTRAINT "inference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."project"("projectId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inference" ADD CONSTRAINT "inference_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."provider"("providerId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."provider"("providerId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config" ADD CONSTRAINT "config_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."provider"("providerId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric" ADD CONSTRAINT "metric_task_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."task"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_provider_fkey" FOREIGN KEY ("providerId") REFERENCES "public"."provider"("providerId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_inference_fkey" FOREIGN KEY ("inferenceId") REFERENCES "public"."inference"("inferenceId") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "highlight_inference_row_unique" ON "highlight" USING btree ("inferenceId","rowId");--> statement-breakpoint
CREATE UNIQUE INDEX "human_score_evaluation_row_unique" ON "human_score" USING btree ("evaluationId","rowId");--> statement-breakpoint
CREATE UNIQUE INDEX "config_provider_user_unique" ON "config" USING btree ("providerId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "note_inference_row_unique" ON "note" USING btree ("inferenceId","rowId");