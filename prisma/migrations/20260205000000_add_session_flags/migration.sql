-- CreateTable
CREATE TABLE "session_flags" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "details" TEXT NOT NULL,
    "metadata" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_flags_session_id_idx" ON "session_flags"("session_id");

-- CreateIndex
CREATE INDEX "session_flags_status_severity_idx" ON "session_flags"("status", "severity");

-- AddForeignKey
ALTER TABLE "session_flags" ADD CONSTRAINT "session_flags_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
