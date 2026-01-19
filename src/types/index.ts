// =============================================================================
// API Error Types
// =============================================================================

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'

export interface ValidationError {
  code: 'VALIDATION_ERROR'
  message: string
  details?: Record<string, string[]>
}

export interface NotFoundError {
  code: 'NOT_FOUND'
  message: string
  resource?: string
}

export interface UnauthorizedError {
  code: 'UNAUTHORIZED'
  message: string
}

export interface ConflictError {
  code: 'CONFLICT'
  message: string
  field?: string
}

export interface InternalError {
  code: 'INTERNAL_ERROR'
  message: string
}

export type ApiError =
  | ValidationError
  | NotFoundError
  | UnauthorizedError
  | ConflictError
  | InternalError

// =============================================================================
// API Response Type
// =============================================================================

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

// =============================================================================
// Domain Types (matching Prisma schema string fields)
// =============================================================================

export const UserRole = {
  SUPERVISOR: 'supervisor',
  COUNSELOR: 'counselor',
} as const
export type UserRole = (typeof UserRole)[keyof typeof UserRole]

export const ScenarioMode = {
  PHONE: 'phone',
  CHAT: 'chat',
} as const
export type ScenarioMode = (typeof ScenarioMode)[keyof typeof ScenarioMode]

export const ScenarioCategory = {
  ONBOARDING: 'onboarding',
  REFRESHER: 'refresher',
  ADVANCED: 'advanced',
  ASSESSMENT: 'assessment',
} as const
export type ScenarioCategory = (typeof ScenarioCategory)[keyof typeof ScenarioCategory]

export const AssignmentStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
} as const
export type AssignmentStatus = (typeof AssignmentStatus)[keyof typeof AssignmentStatus]

export const SessionStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
} as const
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus]

export const TranscriptRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
} as const
export type TranscriptRole = (typeof TranscriptRole)[keyof typeof TranscriptRole]

// =============================================================================
// WebSocket / Realtime Types
// =============================================================================

export const RealtimeMessageType = {
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  INPUT_AUDIO_BUFFER_APPEND: 'input_audio_buffer.append',
  INPUT_AUDIO_BUFFER_COMMIT: 'input_audio_buffer.commit',
  INPUT_AUDIO_BUFFER_CLEAR: 'input_audio_buffer.clear',
  CONVERSATION_ITEM_CREATE: 'conversation.item.create',
  RESPONSE_CREATE: 'response.create',
  RESPONSE_AUDIO_DELTA: 'response.audio.delta',
  RESPONSE_AUDIO_DONE: 'response.audio.done',
  RESPONSE_AUDIO_TRANSCRIPT_DELTA: 'response.audio_transcript.delta',
  RESPONSE_AUDIO_TRANSCRIPT_DONE: 'response.audio_transcript.done',
  RESPONSE_TEXT_DELTA: 'response.text.delta',
  RESPONSE_TEXT_DONE: 'response.text.done',
  RESPONSE_DONE: 'response.done',
  ERROR: 'error',
} as const
export type RealtimeMessageType = (typeof RealtimeMessageType)[keyof typeof RealtimeMessageType]

export interface RealtimeMessage {
  type: RealtimeMessageType | string
  event_id?: string
  session?: {
    id: string
    model?: string
    voice?: string
  }
  delta?: string
  transcript?: string
  audio?: string
  error?: {
    type: string
    code?: string
    message: string
  }
  item?: {
    id: string
    type: string
    role?: string
    content?: Array<{
      type: string
      text?: string
      audio?: string
      transcript?: string
    }>
  }
  response?: {
    id: string
    status: string
    output?: Array<{
      id: string
      type: string
      role?: string
      content?: Array<{
        type: string
        text?: string
        transcript?: string
      }>
    }>
  }
}

export const RealtimeVoice = {
  ALLOY: 'alloy',
  ECHO: 'echo',
  SHIMMER: 'shimmer',
  ASH: 'ash',
  BALLAD: 'ballad',
  CORAL: 'coral',
  SAGE: 'sage',
  VERSE: 'verse',
} as const
export type RealtimeVoice = (typeof RealtimeVoice)[keyof typeof RealtimeVoice]

// =============================================================================
// Application Interfaces
// =============================================================================

export interface EvaluationResult {
  id: string
  sessionId: string
  evaluationText: string
  modelUsed: string | null
  transcriptTurnCount: number | null
  createdAt: Date | string
}

export interface ChatMessage {
  id: string
  role: TranscriptRole
  content: string
  timestamp: Date | string
  isOptimistic?: boolean
}

export const ConnectionStatus = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
} as const
export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus]

export interface TranscriptTurn {
  id: string
  sessionId: string
  turnNumber: number
  role: TranscriptRole
  content: string
  capturedAt: Date | string
}

// =============================================================================
// Re-export Prisma types for convenience
// =============================================================================

export type {
  User,
  Account,
  Scenario,
  Assignment,
  Session,
  TranscriptTurn as PrismaTranscriptTurn,
  Evaluation,
  Recording,
} from '@prisma/client'
