CREATE TABLE "human_score" (
	"id" serial PRIMARY KEY NOT NULL,
	"evaluationId" text NOT NULL,
	"rowId" text NOT NULL,
	"score" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "human_score" ADD CONSTRAINT "human_score_evaluation_fkey" FOREIGN KEY ("evaluationId") REFERENCES "public"."evaluation"("evaluationId") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "human_score_evaluation_row_unique" ON "human_score" USING btree ("evaluationId","rowId");
