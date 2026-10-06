CREATE TABLE "ai_bulk_analysis_usage" (
    "id" SERIAL NOT NULL,
    "usage_date" DATE NOT NULL,
    "execution_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_bulk_analysis_usage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_bulk_analysis_usage_usage_date_key"
ON "ai_bulk_analysis_usage"("usage_date");

CREATE TABLE "ai_bulk_analysis_runs" (
    "id" TEXT NOT NULL,
    "usage_date" DATE NOT NULL,
    "initiated_by_user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_bulk_analysis_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_bulk_analysis_runs_usage_date_idx"
ON "ai_bulk_analysis_runs"("usage_date");

CREATE INDEX "ai_bulk_analysis_runs_initiated_by_user_id_idx"
ON "ai_bulk_analysis_runs"("initiated_by_user_id");
