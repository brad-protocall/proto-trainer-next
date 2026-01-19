import { z } from 'zod'

// Domain enum schemas as string literals (lowercase to match DB)
const UserRoleSchema = z.enum(['supervisor', 'counselor'])
const ScenarioModeSchema = z.enum(['phone', 'chat'])
const ScenarioCategorySchema = z.enum(['onboarding', 'refresher', 'advanced', 'assessment'])
const AssignmentStatusSchema = z.enum(['pending', 'in_progress', 'completed'])

// User validation
export const createUserSchema = z.object({
  externalId: z.string().min(1),
  displayName: z.string().optional(),
  email: z.string().email().optional(),
  role: UserRoleSchema.default('counselor'),
})

export const updateUserSchema = z.object({
  displayName: z.string().optional(),
  email: z.string().email().optional().nullable(),
  role: UserRoleSchema.optional(),
})

// Account validation
export const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  policiesProceduresPath: z.string().optional(),
})

// Scenario validation
export const createScenarioSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  prompt: z.string().min(1),
  mode: ScenarioModeSchema,
  category: ScenarioCategorySchema.optional(),
  accountId: z.string().uuid().optional(),
  isOneTime: z.boolean().default(false),
  relevantPolicySections: z.string().max(500).optional(),
})

export const updateScenarioSchema = createScenarioSchema.partial()

export const scenarioQuerySchema = z.object({
  category: ScenarioCategorySchema.optional(),
  mode: ScenarioModeSchema.optional(),
})

// Assignment validation
export const createAssignmentSchema = z.object({
  scenarioId: z.string().uuid(),
  counselorId: z.string().uuid(),
  dueDate: z.string().datetime().optional(),
  supervisorNotes: z.string().optional(),
})

export const bulkAssignmentSchema = z.object({
  scenarioIds: z.array(z.string().uuid()).min(1),
  counselorIds: z.array(z.string().uuid()).min(1),
  dueDate: z.string().datetime().optional(),
  supervisorNotes: z.string().optional(),
})

export const updateAssignmentSchema = z.object({
  status: AssignmentStatusSchema.optional(),
  dueDate: z.string().datetime().optional().nullable(),
  supervisorNotes: z.string().optional().nullable(),
})

export const assignmentQuerySchema = z.object({
  counselorId: z.string().uuid().optional(),
  status: z.string().optional(),
  scenarioId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

// Session validation
export const createSessionSchema = z.object({
  assignmentId: z.string().uuid(),
})

// Chat message validation
export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
})

// Inferred types
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type CreateScenarioInput = z.infer<typeof createScenarioSchema>
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type BulkAssignmentInput = z.infer<typeof bulkAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type CreateSessionInput = z.infer<typeof createSessionSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
