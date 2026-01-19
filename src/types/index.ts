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
// Domain Types (matching SQLite string enums)
// ============================================

export type UserRole = 'supervisor' | 'counselor'
export type ScenarioMode = 'phone' | 'chat'
export type ScenarioCategory = 'onboarding' | 'refresher' | 'advanced' | 'assessment'
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed'
export type SessionStatus = 'active' | 'completed' | 'abandoned'
export type TranscriptRole = 'user' | 'assistant'

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
  id: string
  role: TranscriptRole
  content: string
  turnOrder: number
  createdAt: Date
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
  vectorStoreId: string | null
}

// ============================================
// Assignment Response Types
// ============================================

export interface AssignmentResponse {
  id: string
  accountId: string | null
  scenarioId: string
  scenarioTitle: string
  scenarioMode: ScenarioMode
  counselorId: string
  counselorName: string | null
  assignedBy: string
  assignedByName: string | null
  status: AssignmentStatus
  createdAt: string
  dueDate: string | null
  startedAt: string | null
  completedAt: string | null
  sessionId: string | null
  evaluationId: string | null
  supervisorNotes: string | null
  isOverdue: boolean
  hasTranscript: boolean
}

export interface BulkAssignmentResponse {
  created: number
  skipped: number
  skippedPairs: Array<{ counselorId: string; scenarioId: string }>
}

// ============================================
// OpenAI Evaluation Response Types
// ============================================

export interface EvaluationFeedback {
  category: string
  score: number
  comment: string
}

export interface EvaluationResponse {
  overallScore: number
  feedback: EvaluationFeedback[]
  strengths: string[]
  areasToImprove: string[]
  rawResponse: string
}
