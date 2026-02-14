-- Update role values from 'counselor' to 'learner'
-- Rollback: UPDATE "users" SET "role" = 'counselor' WHERE "role" = 'learner';
UPDATE "users" SET "role" = 'learner' WHERE "role" = 'counselor';
