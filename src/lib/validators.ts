import { z } from 'zod'
import { VALID_SKILLS } from './skills'

// Domain enum schemas as string literals (lowercase to match DB)
const UserRoleSchema = z.enum(['supervisor', 'counselor'])
const ScenarioModeSchema = z.enum(['phone', 'chat'])

// Single source of truth for category values - export for use in frontend validation
export const ScenarioCategoryValues = [
  'cohort_training',
  'onboarding',
  'expert_skill_path',
  'account_specific',
  'sales',
  'customer_facing',
  'tap',
  'supervisors',
] as const
export const ScenarioCategorySchema = z.enum(ScenarioCategoryValues)
export type ScenarioCategory = z.infer<typeof ScenarioCategorySchema>

// Single source of truth for skill values - derived from skills.ts
export const SkillSchema = z.enum(VALID_SKILLS)
export type Skill = z.infer<typeof SkillSchema>

// Skills array validation with clear error message
export const SkillsArraySchema = z.array(SkillSchema).optional().refine(
  (skills) => !skills || skills.length <= 10,
  { message: 'Maximum 10 skills allowed per scenario' }
)

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
  category: ScenarioCategorySchema.optional().nullable(),
  skills: SkillsArraySchema,
  accountId: z.string().uuid().optional().nullable(),
  isOneTime: z.boolean().default(false),
  relevantPolicySections: z.string().max(500).optional(),
  evaluatorContext: z.string().optional(),
})

export const updateScenarioSchema = createScenarioSchema.partial()

export const scenarioQuerySchema = z.object({
  category: ScenarioCategorySchema.optional(),
  mode: ScenarioModeSchema.optional(),
  isOneTime: z.enum(['true', 'false']).optional(),
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
  dueDate: z.string().datetime().optional().nullable(),
  supervisorNotes: z.string().optional().nullable(),
  forceReassign: z.boolean().optional(),
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

// Session validation - discriminated union for assignment vs free practice
const ModelTypeSchema = z.enum(['phone', 'chat'])

export const createSessionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('assignment'),
    assignmentId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('free_practice'),
    userId: z.string().uuid(),
    scenarioId: z.string().uuid().optional(),
    modelType: ModelTypeSchema,
  }),
])

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
