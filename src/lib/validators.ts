import { z } from 'zod'

// ============================================
// Domain value validators (SQLite uses strings)
// ============================================

const scenarioModeValues = ['phone', 'chat'] as const
const scenarioCategoryValues = ['onboarding', 'refresher', 'advanced', 'assessment'] as const
const assignmentStatusValues = ['pending', 'in_progress', 'completed'] as const

// ============================================
// User validation
// ============================================

export const createUserSchema = z.object({
  externalId: z.string().min(1).max(255),
  displayName: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
  role: z.enum(['supervisor', 'counselor']).default('counselor'),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

// ============================================
// Account validation
// ============================================

export const createAccountSchema = z.object({
  name: z.string().min(1).max(255),
  policiesProceduresPath: z.string().optional(),
})

export type CreateAccountInput = z.infer<typeof createAccountSchema>

// ============================================
// Scenario validation
// ============================================

export const createScenarioSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  prompt: z.string().min(1),
  mode: z.enum(scenarioModeValues).default('phone'),
  category: z.enum(scenarioCategoryValues).optional(),
  accountId: z.string().uuid().optional(),
  isOneTime: z.boolean().default(false),
  relevantPolicySections: z.string().max(500).optional(),
})

export const updateScenarioSchema = createScenarioSchema.partial()

export const scenarioQuerySchema = z.object({
  category: z.enum(scenarioCategoryValues).optional(),
  mode: z.enum(scenarioModeValues).optional(),
})

export type CreateScenarioInput = z.infer<typeof createScenarioSchema>

// ============================================
// Assignment validation
// ============================================

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
  status: z.enum(assignmentStatusValues).optional(),
  dueDate: z.string().datetime().optional().nullable(),
  supervisorNotes: z.string().optional().nullable(),
})

export const assignmentQuerySchema = z.object({
  counselorId: z.string().uuid().optional(),
  status: z.string().optional(), // Comma-separated list of statuses
  scenarioId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
})

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type BulkAssignmentInput = z.infer<typeof bulkAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>

// ============================================
// Chat message validation
// ============================================

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(10000),
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
