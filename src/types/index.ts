// API Response Types
export type ApiErrorType =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "UNAUTHORIZED"
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
export type ScenarioCategory =
  | "onboarding"
  | "refresher"
  | "advanced"
  | "assessment";
export type AssignmentStatus = "pending" | "in_progress" | "completed";
export type SessionStatus = "active" | "completed" | "abandoned";
export type TranscriptRole = "user" | "assistant" | "system";

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

// Domain Interfaces
export interface User {
  id: string;
  external_id: string;
  display_name: string | null;
  email: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  name: string;
  policies_procedures_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface Scenario {
  id: string;
  title: string;
  description: string | null;
  prompt: string;
  mode: ScenarioMode;
  category: ScenarioCategory | null;
  is_one_time: boolean;
  account_id: string | null;
  creator_id: string | null;
  evaluator_context_path: string | null;
  relevant_policy_sections: string | null;
  created_at: string;
  updated_at: string;
  account?: Account;
  creator?: User;
}

export interface Assignment {
  id: string;
  scenario_id: string;
  counselor_id: string;
  status: AssignmentStatus;
  due_date: string | null;
  completed_at: string | null;
  supervisor_notes: string | null;
  session_id: string | null;
  created_at: string;
  updated_at: string;
  scenario?: Scenario;
  counselor?: User;
  // Computed fields for display
  scenario_title?: string;
  scenario_mode?: ScenarioMode;
  counselor_name?: string;
  is_overdue?: boolean;
  has_transcript?: boolean;
}

export interface Session {
  id: string;
  assignment_id: string | null;
  scenario_id: string | null;
  status: SessionStatus;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptTurn {
  id: string;
  session_id: string;
  role: TranscriptRole;
  content: string;
  turn_index: number;
  created_at: string;
}

export interface Evaluation {
  id: string;
  session_id: string;
  evaluation: string;
  transcript_turns?: TranscriptTurn[];
  created_at: string;
}

export interface Recording {
  id: string;
  session_id: string;
  file_path: string;
  duration_seconds: number | null;
  created_at: string;
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

// Form Types
export interface CreateUserInput {
  external_id: string;
  display_name?: string;
  email?: string;
  role: UserRole;
}

export interface CreateAccountInput {
  name: string;
  policies_procedures_path?: string;
}

export interface CreateScenarioInput {
  title: string;
  description?: string;
  prompt: string;
  mode?: ScenarioMode;
  category?: ScenarioCategory;
  account_id?: string;
  relevant_policy_sections?: string;
}

export interface UpdateScenarioInput {
  title?: string;
  description?: string;
  prompt?: string;
  mode?: ScenarioMode;
  category?: ScenarioCategory;
  account_id?: string | null;
  relevant_policy_sections?: string | null;
}

export interface CreateAssignmentInput {
  scenario_id: string;
  counselor_id: string;
  due_date?: string;
  supervisor_notes?: string;
}

export interface BulkAssignmentInput {
  scenario_ids: string[];
  counselor_ids: string[];
  due_date?: string;
  supervisor_notes?: string;
}

export interface UpdateAssignmentInput {
  status?: AssignmentStatus;
  supervisor_notes?: string;
}

// API Response Types for routes
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
  supervisorNotes: string | null;
  isOverdue: boolean;
  hasTranscript: boolean;
}

export interface BulkAssignmentResponse {
  created: number;
  skipped: number;
  skippedPairs?: Array<{ scenarioId: string; counselorId: string }>;
  assignments?: AssignmentResponse[];
}

// OpenAI Evaluation Response
export interface EvaluationFeedbackItem {
  category: string;
  score: number;
  comment: string;
}

export interface EvaluationResponse {
  overallScore: number;
  feedback: EvaluationFeedbackItem[];
  strengths: string[];
  areasToImprove: string[];
  rawResponse: string;
}
