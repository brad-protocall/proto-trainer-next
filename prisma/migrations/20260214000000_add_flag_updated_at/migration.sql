-- Add updated_at to session_flags for audit trail
ALTER TABLE "session_flags" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
