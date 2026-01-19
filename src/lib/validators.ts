import { z } from 'zod';

// User role validation
export const userRoleSchema = z.enum(['supervisor', 'counselor']);

// Scenario mode validation
export const scenarioModeSchema = z.enum(['phone', 'chat']);

// Scenario category validation
export const scenarioCategorySchema = z.enum(['onboarding', 'remediation', 'assessment']);

// Assignment status validation
export const assignmentStatusSchema = z.enum(['pending', 'in_progress', 'completed']);

// Session status validation
export const sessionStatusSchema = z.enum(['active', 'completed', 'abandoned']);

// Transcript role validation
export const transcriptRoleSchema = z.enum(['user', 'assistant', 'system']);

// User schemas
export const createUserSchema = z.object({
  externalId: z.string().min(1, 'External ID is required'),
  displayName: z.string().min(1, 'Display name is required'),
  email: z.string().email().optional().nullable(),
  role: userRoleSchema,
});

export const updateUserSchema = createUserSchema.partial();

// Account schemas
export const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  policiesProceduresPath: z.string().optional().nullable(),
  vectorStoreId: z.string().optional().nullable(),
});

export const updateAccountSchema = createAccountSchema.partial();

// Scenario schemas
export const createScenarioSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
  prompt: z.string().min(1, 'Prompt is required'),
  mode: scenarioModeSchema,
  category: scenarioCategorySchema,
  accountId: z.string().min(1, 'Account ID is required'),
  createdBy: z.string().min(1, 'Creator ID is required'),
});

export const updateScenarioSchema = createScenarioSchema.partial().omit({ createdBy: true });

export const scenarioQuerySchema = z.object({
  category: scenarioCategorySchema.optional(),
  mode: scenarioModeSchema.optional(),
  accountId: z.string().optional(),
});

// Assignment schemas
export const createAssignmentSchema = z.object({
  scenarioId: z.string().min(1, 'Scenario ID is required'),
  counselorId: z.string().min(1, 'Counselor ID is required'),
  assignedBy: z.string().min(1, 'Assigned by ID is required'),
  supervisorNotes: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

export const bulkAssignmentSchema = z.object({
  scenarioIds: z.array(z.string().min(1)).min(1, 'At least one scenario is required'),
  counselorIds: z.array(z.string().min(1)).min(1, 'At least one counselor is required'),
  assignedBy: z.string().min(1, 'Assigned by ID is required'),
  supervisorNotes: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

export const updateAssignmentSchema = z.object({
  status: assignmentStatusSchema.optional(),
  supervisorNotes: z.string().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
});

// Session schemas
export const createSessionSchema = z.object({
  assignmentId: z.string().min(1, 'Assignment ID is required'),
});

export const updateSessionSchema = z.object({
  status: sessionStatusSchema.optional(),
  endedAt: z.string().datetime().optional().nullable(),
});

// Message schema for sending messages in a session
export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required'),
});

// Evaluation schemas
export const createEvaluationSchema = z.object({
  assignmentId: z.string().min(1, 'Assignment ID is required'),
  overallScore: z.number().min(0).max(100),
  feedbackJson: z.string(), // JSON string
  strengths: z.string(),
  areasToImprove: z.string(),
  rawResponse: z.string().optional().nullable(),
});

// Type exports
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type CreateAccount = z.infer<typeof createAccountSchema>;
export type UpdateAccount = z.infer<typeof updateAccountSchema>;
export type CreateScenario = z.infer<typeof createScenarioSchema>;
export type UpdateScenario = z.infer<typeof updateScenarioSchema>;
export type ScenarioQuery = z.infer<typeof scenarioQuerySchema>;
export type CreateAssignment = z.infer<typeof createAssignmentSchema>;
export type BulkAssignment = z.infer<typeof bulkAssignmentSchema>;
export type UpdateAssignment = z.infer<typeof updateAssignmentSchema>;
export type CreateSession = z.infer<typeof createSessionSchema>;
export type UpdateSession = z.infer<typeof updateSessionSchema>;
export type SendMessage = z.infer<typeof sendMessageSchema>;
export type CreateEvaluation = z.infer<typeof createEvaluationSchema>;
