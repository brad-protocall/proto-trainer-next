-- CreateIndex
CREATE INDEX "transcript_turns_session_id_idx" ON "transcript_turns"("session_id");

-- CreateIndex
CREATE INDEX "transcript_turns_session_id_attempt_number_idx" ON "transcript_turns"("session_id", "attempt_number");
