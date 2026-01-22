-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN "difficulty" TEXT DEFAULT 'intermediate';
ALTER TABLE "scenarios" ADD COLUMN "estimated_time" INTEGER DEFAULT 15;
ALTER TABLE "scenarios" ADD COLUMN "skill" TEXT;
