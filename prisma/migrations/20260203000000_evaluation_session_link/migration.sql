-- AlterTable: Make assignmentId nullable on evaluations
ALTER TABLE "evaluations" ALTER COLUMN "assignment_id" DROP NOT NULL;

-- AlterTable: Add sessionId to evaluations
ALTER TABLE "evaluations" ADD COLUMN "session_id" TEXT;

-- CreateIndex: Unique constraint on session_id
CREATE UNIQUE INDEX "evaluations_session_id_key" ON "evaluations"("session_id");

-- AddForeignKey: evaluations.session_id -> sessions.id (RESTRICT to prevent orphans)
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: At least one parent FK must be non-null (exclusive arc)
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_must_have_parent" CHECK ("assignment_id" IS NOT NULL OR "session_id" IS NOT NULL);
