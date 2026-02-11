-- AlterTable
ALTER TABLE "session_flags" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'evaluation';

-- CreateIndex
CREATE INDEX "session_flags_session_id_source_idx" ON "session_flags"("session_id", "source");
