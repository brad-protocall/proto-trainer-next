/*
  Warnings:

  - You are about to drop the column `policies_vector_file_id` on the `accounts` table. All the data in the column will be lost.
  - You are about to drop the column `evaluation_id` on the `assignments` table. All the data in the column will be lost.
  - You are about to drop the column `session_id` on the `assignments` table. All the data in the column will be lost.
  - You are about to drop the column `evaluation_text` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `model_used` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `session_id` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `transcript_turn_count` on the `evaluations` table. All the data in the column will be lost.
  - You are about to drop the column `duration_seconds` on the `recordings` table. All the data in the column will be lost.
  - You are about to drop the column `file_size_bytes` on the `recordings` table. All the data in the column will be lost.
  - You are about to drop the column `model_type` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `scenario_id` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `user_id` on the `sessions` table. All the data in the column will be lost.
  - You are about to drop the column `captured_at` on the `transcript_turns` table. All the data in the column will be lost.
  - You are about to drop the column `turn_number` on the `transcript_turns` table. All the data in the column will be lost.
  - Added the required column `updated_at` to the `accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `areas_to_improve` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assignment_id` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `feedback_json` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `overall_score` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Added the required column `strengths` to the `evaluations` table without a default value. This is not possible if the table is not empty.
  - Made the column `account_id` on table `scenarios` required. This step will fail if there are existing NULL values in that column.
  - Made the column `updated_at` on table `scenarios` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `assignment_id` to the `sessions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `turn_order` to the `transcript_turns` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "policies_procedures_path" TEXT,
    "vector_store_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_accounts" ("id", "name", "policies_procedures_path") SELECT "id", "name", "policies_procedures_path" FROM "accounts";
DROP TABLE "accounts";
ALTER TABLE "new_accounts" RENAME TO "accounts";
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
    CONSTRAINT "assignments_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "assignments_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "scenarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "assignments_counselor_id_fkey" FOREIGN KEY ("counselor_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_assignments" ("account_id", "assigned_by", "completed_at", "counselor_id", "created_at", "due_date", "id", "scenario_id", "started_at", "status", "supervisor_notes") SELECT "account_id", "assigned_by", "completed_at", "counselor_id", "created_at", "due_date", "id", "scenario_id", "started_at", "status", "supervisor_notes" FROM "assignments";
DROP TABLE "assignments";
ALTER TABLE "new_assignments" RENAME TO "assignments";
CREATE TABLE "new_evaluations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignment_id" TEXT NOT NULL,
    "overall_score" REAL NOT NULL,
    "feedback_json" TEXT NOT NULL,
    "strengths" TEXT NOT NULL,
    "areas_to_improve" TEXT NOT NULL,
    "raw_response" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "evaluations_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_evaluations" ("created_at", "id") SELECT "created_at", "id" FROM "evaluations";
DROP TABLE "evaluations";
ALTER TABLE "new_evaluations" RENAME TO "evaluations";
CREATE UNIQUE INDEX "evaluations_assignment_id_key" ON "evaluations"("assignment_id");
CREATE TABLE "new_recordings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "duration" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_recordings" ("created_at", "file_path", "id", "session_id") SELECT "created_at", "file_path", "id", "session_id" FROM "recordings";
DROP TABLE "recordings";
ALTER TABLE "new_recordings" RENAME TO "recordings";
CREATE TABLE "new_scenarios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "prompt" TEXT NOT NULL,
    "evaluator_context_path" TEXT,
    "account_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    "is_one_time" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'phone',
    "relevant_policy_sections" TEXT,
    "category" TEXT,
    CONSTRAINT "scenarios_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "scenarios_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_scenarios" ("account_id", "category", "created_at", "created_by", "description", "evaluator_context_path", "id", "is_one_time", "mode", "prompt", "relevant_policy_sections", "title", "updated_at") SELECT "account_id", "category", "created_at", "created_by", "description", "evaluator_context_path", "id", "is_one_time", "mode", "prompt", "relevant_policy_sections", "title", "updated_at" FROM "scenarios";
DROP TABLE "scenarios";
ALTER TABLE "new_scenarios" RENAME TO "scenarios";
CREATE TABLE "new_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignment_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" DATETIME,
    CONSTRAINT "sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_sessions" ("ended_at", "id", "started_at", "status") SELECT "ended_at", "id", "started_at", "status" FROM "sessions";
DROP TABLE "sessions";
ALTER TABLE "new_sessions" RENAME TO "sessions";
CREATE UNIQUE INDEX "sessions_assignment_id_key" ON "sessions"("assignment_id");
CREATE TABLE "new_transcript_turns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "turn_order" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transcript_turns_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_transcript_turns" ("content", "id", "role", "session_id") SELECT "content", "id", "role", "session_id" FROM "transcript_turns";
DROP TABLE "transcript_turns";
ALTER TABLE "new_transcript_turns" RENAME TO "transcript_turns";
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "external_id" TEXT NOT NULL,
    "display_name" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'counselor',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);
INSERT INTO "new_users" ("created_at", "display_name", "email", "external_id", "id", "role", "updated_at") SELECT "created_at", "display_name", "email", "external_id", "id", "role", "updated_at" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_external_id_key" ON "users"("external_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
