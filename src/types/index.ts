// ============================================
// API Response Types (Discriminated Union)
// ============================================

export type ApiError =
  | { code: 'VALIDATION_ERROR'; fields: Record<string, string[]> }
  | { code: 'NOT_FOUND'; message: string }
  | { code: 'UNAUTHORIZED'; message: string }
  | { code: 'CONFLICT'; message: string }
  | { code: 'INTERNAL_ERROR'; message: string }

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

// ============================================
// Domain Types
// ============================================

export type UserRole = 'SUPERVISOR' | 'COUNSELOR'
export type ScenarioMode = 'PHONE' | 'CHAT'
export type ScenarioCategory = 'ONBOARDING' | 'REFRESHER' | 'ADVANCED' | 'ASSESSMENT'
export type AssignmentStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
export type SessionStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED'
export type TranscriptRole = 'USER' | 'ASSISTANT'

// ============================================
// WebSocket/Realtime Types
// ============================================

export type RealtimeMessageType =
  | 'session.id'
  | 'response.audio.delta'
  | 'response.text.delta'
  | 'input_audio_buffer.speech_started'
  | 'input_audio_buffer.speech_stopped'
  | 'error'

export interface RealtimeMessage {
  type: RealtimeMessageType
  session_id?: string
  delta?: string
  text?: string
  error?: { message: string; code?: string }
}

export type RealtimeVoice = 'shimmer' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova'

// ============================================
// Evaluation Types
// ============================================

export interface EvaluationResult {
  evaluation: string
  grade: string | null
}

// ============================================
// Chat Types
// ============================================

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ============================================
// Hook State Types
// ============================================

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface TranscriptTurn {
  role: TranscriptRole
  content: string
  timestamp: Date
}

// ============================================
// User Types
// ============================================

export interface User {
  id: string
  externalId: string
  displayName: string | null
  email: string | null
  role: UserRole
}

// ============================================
// Scenario Types
// ============================================

export interface Scenario {
  id: string
  title: string
  description: string | null
  prompt: string
  mode: ScenarioMode
  category: ScenarioCategory | null
  isOneTime: boolean
  accountId: string | null
  createdById: string
  createdAt: Date
  account?: { name: string } | null
  creator?: { displayName: string | null }
}

// ============================================
// Assignment Types
// ============================================

export interface Assignment {
  id: string
  scenarioId: string
  counselorId: string
  assignedById: string
  status: AssignmentStatus
  dueDate: Date | null
  supervisorNotes: string | null
  scenario?: Scenario
  counselor?: User
  supervisor?: User
}

// ============================================
// Account Types
// ============================================

export interface Account {
  id: string
  name: string
  policiesProceduresPath: string | null
  policiesVectorFileId: string | null
}
