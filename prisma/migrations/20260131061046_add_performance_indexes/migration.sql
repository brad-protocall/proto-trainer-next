-- CreateIndex
CREATE INDEX "assignments_counselor_id_idx" ON "assignments"("counselor_id");

-- CreateIndex
CREATE INDEX "assignments_scenario_id_idx" ON "assignments"("scenario_id");

-- CreateIndex
CREATE INDEX "assignments_status_idx" ON "assignments"("status");

-- CreateIndex
CREATE INDEX "sessions_assignment_id_idx" ON "sessions"("assignment_id");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_scenario_id_idx" ON "sessions"("scenario_id");
