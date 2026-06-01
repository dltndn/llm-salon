-- AlterTable
ALTER TABLE "topics" ADD COLUMN "deleted_at" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "topics_project_id_deleted_at_created_at_idx" ON "topics"("project_id", "deleted_at", "created_at");
