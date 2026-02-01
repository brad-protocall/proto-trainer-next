// API Response Types
export type ApiErrorType =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export interface ApiError {
  type: ApiErrorType;
  message: string;
  details?: Record<string, unknown>;
}

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

// Domain Enums
export type UserRole = "counselor" | "supervisor" | "admin";
export type ScenarioMode = "phone" | "chat";
// Must match ScenarioCategoryValues in src/lib/validators.ts
export type ScenarioCategory =
  | "cohort_training"
  | "onboarding"
  | "expert_skill_path"
  | "account_specific"
  | "sales"
  | "customer_facing"
  | "tap"
  | "supervisors";
export type AssignmentStatus = "pending" | "in_progress" | "completed";
export type SessionStatus = "active" | "completed" | "abandoned";
export type TranscriptRole = "user" | "assistant" | "system";
export type ModelType = "phone" | "chat";
export type SessionType = "assignment" | "free_practice";

// WebSocket Types
export type RealtimeMessageType =
  | "session.created"
  | "session.updated"
  | "input_audio_buffer.speech_started"
  | "input_audio_buffer.speech_stopped"
  | "input_audio_buffer.committed"
  | "conversation.item.created"
  | "response.audio.delta"
  | "response.audio.done"
  | "response.audio_transcript.delta"
  | "response.audio_transcript.done"
  | "response.done"
  | "error";

export interface RealtimeMessage {
  type: RealtimeMessageType;
  event_id?: string;
  session?: {
    id: string;
    model: string;
    voice: string;
  };
  delta?: string;
  transcript?: string;
  item?: {
    id: string;
    type: string;
    role: TranscriptRole;
    content?: Array<{
      type: string;
      text?: string;
      transcript?: string;
    }>;
  };
  error?: {
    type: string;
    code: string;
    message: string;
  };
}

export interface RealtimeVoice {
  id: string;
  name: string;
  description: string;
}

// Domain Interfaces (API response shapes - camelCase to match Prisma output)
export interface User {
  id: string;
  externalId: string;
  displayName: string | null;
  email: string | null;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export interface Account {
  id: string;
  name: string;
  policiesProceduresPath: string | null;
  vectorStoreId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ScenarioDifficulty = "beginner" | "intermediate" | "advanced";

export interface Scenario {
  id: string;
  title: string;
  description: string | null;
  prompt: string;
  mode: ScenarioMode;
  category: ScenarioCategory | null;
  isOneTime: boolean;
  accountId: string | null;
  creatorId: string | null;
  evaluatorContextPath: string | null;
  relevantPolicySections: string | null;
  createdAt: string;
  updatedAt: string;
  // External API metadata
  skill: string | null;  // DEPRECATED - use skills array
  skills: string[];
  difficulty: ScenarioDifficulty | null;
  estimatedTime: number | null;
  account?: Account;
  creator?: User;
}

export interface Assignment {
  id: string;
  scenarioId: string;
  counselorId: string;
  status: AssignmentStatus;
  dueDate: string | null;
  completedAt: string | null;
  supervisorNotes: string | null;
  requireRecording?: boolean;
  sessionId: string | null;
  createdAt: string;
  updatedAt: string;
  scenario?: Scenario;
  counselor?: User;
  // Computed fields for display
  scenarioTitle?: string;
  scenarioMode?: ScenarioMode;
  counselorName?: string;
  isOverdue?: boolean;
  hasTranscript?: boolean;
  // Additional fields from API
  accountId?: string | null;
  assignedBy?: string;
  assignedByName?: string | null;
  startedAt?: string | null;
  evaluationId?: string | null;
  recordingId?: string | null;
}

export interface Session {
  id: string;
  assignmentId: string | null;
  userId: string | null;
  scenarioId: string | null;
  modelType: ModelType;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  currentAttempt?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TranscriptTurn {
  id: string;
  sessionId: string;
  role: TranscriptRole;
  content: string;
  turnOrder: number;
  attemptNumber?: number;
  createdAt: string;
}

export interface Evaluation {
  id: string;
  assignmentId: string;
  overallScore: number;
  feedbackJson: string;
  strengths: string;
  areasToImprove: string;
  rawResponse: string | null;
  createdAt: string;
}

export interface Recording {
  id: string;
  sessionId: string;
  filePath: string;
  duration: number | null;
  fileSizeBytes: number | null;
  createdAt: string;
}

// UI State Types
export interface ChatMessage {
  role: TranscriptRole;
  content: string;
  failed?: boolean;
  timestamp?: Date;
}

export interface EvaluationResult {
  evaluation: string;
  transcript_turns?: TranscriptTurn[];
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

// API Response Types for routes (camelCase for JSON responses)
export interface AssignmentResponse {
  id: string;
  accountId: string | null;
  scenarioId: string;
  scenarioTitle: string;
  scenarioMode: ScenarioMode;
  counselorId: string;
  counselorName: string | null;
  assignedBy: string;
  assignedByName: string | null;
  status: AssignmentStatus;
  createdAt: string;
  dueDate: string | null;
  startedAt: string | null;
  completedAt: string | null;
  sessionId: string | null;
  evaluationId: string | null;
  recordingId: string | null;
  supervisorNotes: string | null;
  requireRecording?: boolean;
  isOverdue: boolean;
  hasTranscript: boolean;
}

export interface BulkAssignmentResponse {
  created: number;
  skipped: number;
  blocked?: Array<{ scenarioId: string; counselorId: string; reason: string }>;
  warnings?: Array<{ scenarioId: string; counselorId: string; reason: string }>;
  requiresConfirmation?: boolean;
  message?: string;
  assignments?: AssignmentResponse[];
}

// OpenAI Evaluation Response
export interface EvaluationResponse {
  /** Full markdown evaluation with all sections */
  evaluation: string;
  /** Letter grade extracted from evaluation (A, B, C, D, F) */
  grade: string | null;
  /** Numeric score derived from grade (A=95, B=85, C=75, D=65, F=50) */
  numericScore: number;
}

// Session Response Types
export interface SessionResponse {
  id: string;
  assignmentId: string | null;
  userId: string | null;
  scenarioId: string | null;
  modelType: ModelType;
  status: SessionStatus;
  startedAt: string;
  endedAt: string | null;
  transcript?: TranscriptTurn[];
  recording?: Recording;
}
