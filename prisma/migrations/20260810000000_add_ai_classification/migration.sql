ALTER TABLE "incidents"
  ADD COLUMN "ai_classification" TEXT,
  ADD COLUMN "ai_incident_type_id" INTEGER,
  ADD COLUMN "ai_confidence" DOUBLE PRECISION,
  ADD COLUMN "ai_reason" TEXT,
  ADD COLUMN "ai_analyzed_at" TIMESTAMP(3),
  ADD COLUMN "ai_model" TEXT,
  ADD COLUMN "ai_reviewed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "human_classification" TEXT,
  ADD COLUMN "human_incident_type_id" INTEGER,
  ADD COLUMN "human_reason" TEXT,
  ADD COLUMN "ai_reviewed_at" TIMESTAMP(3),
  ADD COLUMN "ai_reviewed_by_user_id" INTEGER;

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_ai_incident_type_id_fkey"
  FOREIGN KEY ("ai_incident_type_id") REFERENCES "incident_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_human_incident_type_id_fkey"
  FOREIGN KEY ("human_incident_type_id") REFERENCES "incident_types"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "incidents_ai_classification_idx" ON "incidents"("ai_classification");
CREATE INDEX "incidents_ai_incident_type_id_idx" ON "incidents"("ai_incident_type_id");
CREATE INDEX "incidents_human_incident_type_id_idx" ON "incidents"("human_incident_type_id");
