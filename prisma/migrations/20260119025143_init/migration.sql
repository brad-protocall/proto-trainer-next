-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'COUNSELOR',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "policies_procedures_path" TEXT,
    "policies_vector_file_id" TEXT
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "prompt" TEXT NOT NULL,
    "evaluator_context_path" TEXT,
    "account_id" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME,
    "is_one_time" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'PHONE',
    "relevant_policy_sections" TEXT,
    "category" TEXT,
    CONSTRAINT "scenarios_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "scenarios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "account_id" TEXT,
    "scenario_id" TEXT NOT NULL,
    "counselor_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" DATETIME,
    "started_at" DATETIME,
    "completed_at" DATETIME,
    "supervisor_notes" TEXT,
    "session_id" TEXT,
    "evaluation_id" TEXT,
    CONSTRAINT "assignments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assignments_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_counselor_id_fkey" FOREIGN KEY ("counselor_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assignments_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "scenario_id" TEXT,
    "model_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "sessions_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transcript_turns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "turn_number" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "captured_at" DATETIME NOT NULL,
    CONSTRAINT "transcript_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "evaluation_text" TEXT NOT NULL,
    "model_used" TEXT,
    "transcript_turn_count" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "file_size_bytes" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recordings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_session_id_key" ON "assignments"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_session_id_key" ON "evaluations"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_session_id_key" ON "recordings"("session_id");
