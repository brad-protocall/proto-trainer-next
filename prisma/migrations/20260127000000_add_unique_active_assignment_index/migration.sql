-- CreateIndex: Partial unique index to prevent duplicate active assignments
-- This prevents race conditions where concurrent requests could create duplicate
-- non-completed assignments for the same counselor/scenario pair
CREATE UNIQUE INDEX "unique_active_assignment" ON "assignments" ("counselor_id", "scenario_id")
WHERE "status" != 'completed';
