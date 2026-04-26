-- AddUploadedStatus: Add UPLOADED to the Status enum
ALTER TYPE "Status" ADD VALUE 'UPLOADED';

-- AddSlotIdToContentSchedule: Link ContentSchedule back to ContentSlot (spec requirement)
ALTER TABLE "ContentSchedule" ADD COLUMN "slot_id" TEXT;

-- AddForeignKey for slot_id
ALTER TABLE "ContentSchedule" ADD CONSTRAINT "ContentSchedule_slot_id_fkey" 
  FOREIGN KEY ("slot_id") REFERENCES "ContentSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add created_at / updated_at to ContentSchedule (align naming with other tables)
ALTER TABLE "ContentSchedule" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "ContentSchedule" RENAME COLUMN "updatedAt" TO "updated_at";

-- CreateIndex: composite index on content subject+status (if not exists)
CREATE INDEX IF NOT EXISTS "Content_subject_status_idx" ON "Content"("subject", "status");

-- Backfill slot_id: Link existing ContentSchedule rows to their ContentSlot via content_id
UPDATE "ContentSchedule" cs
SET "slot_id" = (
  SELECT csl.id
  FROM "ContentSlot" csl
  WHERE csl.content_id = cs.content_id
  LIMIT 1
);
