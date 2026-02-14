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
  accountNumber: z.string().max(20).optional(),
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
  evaluatorContext: z.string().max(5000).optional(),
})

export const updateScenarioSchema = createScenarioSchema.partial()

export const scenarioQuerySchema = z.object({
  category: ScenarioCategorySchema.optional(),
  mode: ScenarioModeSchema.optional(),
  isOneTime: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
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

// Session query validation
const SessionStatusSchema = z.enum(['active', 'completed', 'abandoned'])
const SessionTypeFilterSchema = z.enum(['free_practice', 'assigned', 'all'])

export const sessionQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  status: SessionStatusSchema.optional(),
  type: SessionTypeFilterSchema.optional().default('free_practice'),
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

// LiveKit token request validation
export const createLiveKitTokenSchema = z.object({
  assignmentId: z.string().uuid().optional(),
  scenarioId: z.string().uuid().optional(),
})

// --- Session Flag enums (single source of truth) ---

// Flag type — exhaustive list across all governance features
export const SessionFlagTypeValues = [
  // Counselor-reported
  'user_feedback',
  'ai_guidance_concern',
  'voice_technical_issue',
  // Safety (auto-detected)
  'jailbreak',
  'inappropriate',
  'off_topic',
  'pii_sharing',
  'system_gaming',
  // Consistency (auto-detected)
  'role_confusion',
  'prompt_leakage',
  'character_break',
  'behavior_omission',
  'unauthorized_elements',
  'difficulty_mismatch',
  // Audit trail
  'analysis_clean',
] as const
export const SessionFlagTypeSchema = z.enum(SessionFlagTypeValues)
export type SessionFlagType = z.infer<typeof SessionFlagTypeSchema>

export const FlagSeverityValues = ['info', 'warning', 'critical'] as const
export const FlagSeveritySchema = z.enum(FlagSeverityValues)
export type FlagSeverity = z.infer<typeof FlagSeveritySchema>

export const FlagStatusValues = ['pending', 'reviewed', 'dismissed'] as const
export const FlagStatusSchema = z.enum(FlagStatusValues)
export type FlagStatus = z.infer<typeof FlagStatusSchema>

export const FlagSourceValues = ['evaluation', 'analysis', 'user_feedback'] as const
export const FlagSourceSchema = z.enum(FlagSourceValues)
export type FlagSource = z.infer<typeof FlagSourceSchema>

// Counselor feedback submission
export const createFlagSchema = z.object({
  type: z.enum(['user_feedback', 'ai_guidance_concern', 'voice_technical_issue']),
  details: z.string().min(1).max(1000),
})

// Supervisor flag query
export const flagQuerySchema = z.object({
  status: FlagStatusSchema.optional(),
  severity: FlagSeveritySchema.optional(),
  sessionId: z.string().uuid().optional(),
})

// Scenario generation from complaint text
export const generateScenarioSchema = z.object({
  sourceText: z.string().min(50).max(15000),
  additionalInstructions: z.string().max(1000).optional(),
})

export const generatedScenarioSchema = z.object({
  title: z.string().max(255),
  description: z.string().max(2000),
  prompt: z.string().max(10000),
  evaluatorContext: z.string().max(5000),
  category: ScenarioCategorySchema.nullable(),
  skills: z.array(SkillSchema).max(10),
})

export type GenerateScenarioInput = z.infer<typeof generateScenarioSchema>
export type GeneratedScenario = z.infer<typeof generatedScenarioSchema>

// Document review result (structured output from LLM)
export const DocumentGapTypeValues = ['fabrication', 'omission', 'minimization', 'inaccuracy', 'formatting'] as const
export const DocumentGapSeverityValues = ['critical', 'important', 'minor'] as const

export const documentReviewResultSchema = z.object({
  transcriptAccuracy: z.number().int().min(0).max(100),
  guidelinesCompliance: z.number().int().min(0).max(100),
  overallScore: z.number().int().min(0).max(100),
  specificGaps: z.array(z.object({
    type: z.enum(DocumentGapTypeValues),
    detail: z.string(),
    severity: z.enum(DocumentGapSeverityValues),
  })),
  narrative: z.string(),
})
export type DocumentReviewResult = z.infer<typeof documentReviewResultSchema>

// Post-session analysis result (combined misuse + consistency scanning)
export const analysisResultSchema = z.object({
  misuse: z.object({
    clean: z.boolean(),
    findings: z.array(z.object({
      category: z.enum(['jailbreak', 'inappropriate', 'off_topic', 'pii_sharing', 'system_gaming']),
      severity: z.enum(['critical', 'warning', 'info']),
      summary: z.string().max(200),
      evidence: z.string().max(500),
    })),
  }),
  consistency: z.object({
    assessed: z.boolean(),
    overallScore: z.number().min(1).max(10).nullable(),
    findings: z.array(z.object({
      category: z.enum([
        'role_confusion', 'prompt_leakage', 'character_break',
        'behavior_omission', 'unauthorized_elements', 'difficulty_mismatch',
      ]),
      severity: z.enum(['critical', 'warning', 'info']),
      summary: z.string().max(200),
      evidence: z.string().max(500),
      promptReference: z.string().max(300),
    })),
    summary: z.string().max(500).nullable(),
  }),
})
export type AnalysisResult = z.infer<typeof analysisResultSchema>

// Dedicated schema for one-time scenario creation with auto-assignment
// Separate from createScenarioSchema to avoid contaminating update/external APIs
export const createOneTimeScenarioWithAssignmentSchema = createScenarioSchema.extend({
  assignTo: z.string().uuid(),
  isOneTime: z.literal(true),
})
export type CreateOneTimeScenarioWithAssignmentInput = z.infer<typeof createOneTimeScenarioWithAssignmentSchema>

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
