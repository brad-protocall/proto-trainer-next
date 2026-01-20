-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT,
    "scenario_id" TEXT NOT NULL,
    "counselor_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATETIME,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "supervisor_notes" TEXT,
    "require_recording" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "assignments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assignments_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_counselor_id_fkey" FOREIGN KEY ("counselor_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_assignments" ("account_id", "assigned_by", "completed_at", "counselor_id", "created_at", "due_date", "id", "scenario_id", "started_at", "status", "supervisor_notes") SELECT "account_id", "assigned_by", "completed_at", "counselor_id", "created_at", "due_date", "id", "scenario_id", "started_at", "status", "supervisor_notes" FROM "assignments";
DROP TABLE "assignments";
ALTER TABLE "new_assignments" RENAME TO "assignments";
CREATE TABLE "new_recordings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "duration" INTEGER,
    "file_size_bytes" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_recordings" ("created_at", "duration", "file_path", "id", "session_id") SELECT "created_at", "duration", "file_path", "id", "session_id" FROM "recordings";
DROP TABLE "recordings";
ALTER TABLE "new_recordings" RENAME TO "recordings";
CREATE UNIQUE INDEX "recordings_session_id_key" ON "recordings"("session_id");
CREATE TABLE "new_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignment_id" TEXT,
    "user_id" TEXT,
    "scenario_id" TEXT,
    "model_type" TEXT NOT NULL DEFAULT 'chat',
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sessions_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_sessions" ("assignment_id", "ended_at", "id", "started_at", "status") SELECT "assignment_id", "ended_at", "id", "started_at", "status" FROM "sessions";
DROP TABLE "sessions";
ALTER TABLE "new_sessions" RENAME TO "sessions";
CREATE UNIQUE INDEX "sessions_assignment_id_key" ON "sessions"("assignment_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
