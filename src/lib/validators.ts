import { z } from 'zod'
import { UserRole, ScenarioMode, ScenarioCategory, AssignmentStatus } from '@/types'

// =============================================================================
// User Validation Schemas
// =============================================================================

export const createUserSchema = z.object({
  externalId: z.string().min(1, 'External ID is required').max(255),
  displayName: z.string().min(1).max(255).optional(),
  email: z.string().email('Invalid email format').optional(),
  role: z.enum([UserRole.SUPERVISOR, UserRole.COUNSELOR]).default(UserRole.COUNSELOR),
})

export const updateUserSchema = createUserSchema.partial().omit({ externalId: true })

export const userQuerySchema = z.object({
  role: z.enum([UserRole.SUPERVISOR, UserRole.COUNSELOR]).optional(),
  orderBy: z.enum(['name', 'created_at']).default('name'),
})

// =============================================================================
// Account Validation Schemas
// =============================================================================

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  policiesProceduresPath: z.string().max(500).optional(),
})

export const updateAccountSchema = createAccountSchema.partial()

// =============================================================================
// Scenario Validation Schemas
// =============================================================================

export const createScenarioSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().optional(),
  prompt: z.string().min(1, 'Prompt is required'),
  mode: z.enum([ScenarioMode.PHONE, ScenarioMode.CHAT]).default(ScenarioMode.PHONE),
  category: z.enum([
    ScenarioCategory.ONBOARDING,
    ScenarioCategory.REFRESHER,
    ScenarioCategory.ADVANCED,
    ScenarioCategory.ASSESSMENT,
  ]).optional(),
  accountId: z.string().uuid('Invalid account ID').optional(),
  isOneTime: z.boolean().default(false),
  relevantPolicySections: z.string().max(500).optional(),
})

export const updateScenarioSchema = createScenarioSchema.partial()

export const scenarioQuerySchema = z.object({
  category: z.enum([
    ScenarioCategory.ONBOARDING,
    ScenarioCategory.REFRESHER,
    ScenarioCategory.ADVANCED,
    ScenarioCategory.ASSESSMENT,
  ]).optional(),
  mode: z.enum([ScenarioMode.PHONE, ScenarioMode.CHAT]).optional(),
})

// =============================================================================
// Assignment Validation Schemas
// =============================================================================

export const createAssignmentSchema = z.object({
  scenarioId: z.string().uuid('Invalid scenario ID'),
  counselorId: z.string().uuid('Invalid counselor ID'),
  accountId: z.string().uuid('Invalid account ID').optional(),
  dueDate: z.string().datetime().optional(),
  supervisorNotes: z.string().max(1000).optional(),
})

export const bulkAssignmentSchema = z.object({
  scenarioIds: z.array(z.string().uuid()).min(1, 'At least one scenario is required'),
  counselorIds: z.array(z.string().uuid()).min(1, 'At least one counselor is required'),
  accountId: z.string().uuid('Invalid account ID').optional(),
  dueDate: z.string().datetime().optional(),
})

export const updateAssignmentSchema = z.object({
  status: z.enum([
    AssignmentStatus.PENDING,
    AssignmentStatus.IN_PROGRESS,
    AssignmentStatus.COMPLETED,
  ]).optional(),
  supervisorNotes: z.string().max(1000).optional(),
  dueDate: z.string().datetime().optional(),
})

export const assignmentQuerySchema = z.object({
  counselorId: z.string().uuid().optional(),
  status: z.enum([
    AssignmentStatus.PENDING,
    AssignmentStatus.IN_PROGRESS,
    AssignmentStatus.COMPLETED,
  ]).optional(),
})

// =============================================================================
// Chat / Session Validation Schemas
// =============================================================================

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(10000),
})

export const createSessionSchema = z.object({
  scenarioId: z.string().uuid('Invalid scenario ID').optional(),
  assignmentId: z.string().uuid('Invalid assignment ID').optional(),
})

// =============================================================================
// Inferred Types
// =============================================================================

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UserQueryInput = z.infer<typeof userQuerySchema>

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

export type CreateScenarioInput = z.infer<typeof createScenarioSchema>
export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>
export type ScenarioQueryInput = z.infer<typeof scenarioQuerySchema>

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type BulkAssignmentInput = z.infer<typeof bulkAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type AssignmentQueryInput = z.infer<typeof assignmentQuerySchema>

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type CreateSessionInput = z.infer<typeof createSessionSchema>
