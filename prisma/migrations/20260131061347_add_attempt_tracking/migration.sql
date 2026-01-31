-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "current_attempt" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "transcript_turns" ADD COLUMN     "attempt_number" INTEGER NOT NULL DEFAULT 1;
