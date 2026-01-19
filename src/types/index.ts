// Domain types - these mirror the Prisma schema but with typed enums

export type UserRole = 'supervisor' | 'counselor';
export type ScenarioMode = 'phone' | 'chat';
export type ScenarioCategory = 'onboarding' | 'remediation' | 'assessment';
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed';
export type SessionStatus = 'active' | 'completed' | 'abandoned';
export type TranscriptRole = 'user' | 'assistant' | 'system';

// API Error types - discriminated union for type-safe error handling
export type ApiErrorType =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export interface ApiError {
  type: ApiErrorType;
  message: string;
  details?: Record<string, unknown>;
}

// API Response type - discriminated union for success/error
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

// WebSocket types for realtime voice
export type RealtimeMessageType =
  | 'session.created'
  | 'session.updated'
  | 'input_audio_buffer.append'
  | 'input_audio_buffer.commit'
  | 'conversation.item.create'
  | 'response.create'
  | 'response.audio.delta'
  | 'response.audio.done'
  | 'response.audio_transcript.delta'
  | 'response.audio_transcript.done'
  | 'response.done'
  | 'error';

export interface RealtimeMessage {
  type: RealtimeMessageType;
  event_id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export interface RealtimeVoice {
  id: string;
  name: string;
}

// Evaluation result from AI
export interface EvaluationResult {
  overallScore: number;
  strengths: string[];
  areasToImprove: string[];
  feedback: Record<string, unknown>;
  rawResponse?: string;
}

// Chat message for display
export interface ChatMessage {
  id: string;
  role: TranscriptRole;
  content: string;
  timestamp: Date;
}

// Connection status for WebSocket
export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// Transcript turn for session history
export interface TranscriptTurn {
  id: string;
  role: TranscriptRole;
  content: string;
  turnOrder: number;
  createdAt: Date;
}

// Session with transcript
export interface SessionWithTranscript {
  id: string;
  assignmentId: string;
  status: SessionStatus;
  startedAt: Date;
  endedAt?: Date | null;
  transcript: TranscriptTurn[];
}

// Assignment with related data
export interface AssignmentWithDetails {
  id: string;
  scenarioId: string;
  counselorId: string;
  assignedBy: string;
  status: AssignmentStatus;
  supervisorNotes?: string | null;
  dueDate?: Date | null;
  scenario: {
    id: string;
    title: string;
    description?: string | null;
    prompt: string;
    mode: ScenarioMode;
    category: ScenarioCategory;
  };
  counselor: {
    id: string;
    displayName: string;
    email?: string | null;
  };
  session?: {
    id: string;
    status: SessionStatus;
  } | null;
  evaluation?: {
    id: string;
    overallScore: number;
  } | null;
}
