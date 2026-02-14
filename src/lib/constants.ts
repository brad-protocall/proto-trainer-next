// API base URLs
export const API_BASE_URL = '/api'

// Assignment status display labels
export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
}

// Scenario mode display labels
export const SCENARIO_MODE_LABELS: Record<string, string> = {
  PHONE: 'Phone',
  CHAT: 'Chat',
}

// Scenario category display labels
export const SCENARIO_CATEGORY_LABELS: Record<string, string> = {
  ONBOARDING: 'Onboarding',
  REFRESHER: 'Refresher',
  ADVANCED: 'Advanced',
  ASSESSMENT: 'Assessment',
}

// User role display labels
export const USER_ROLE_LABELS: Record<string, string> = {
  SUPERVISOR: 'Supervisor',
  LEARNER: 'Learner',
}

// Audio settings
export const AUDIO_SAMPLE_RATE = 24000
export const AUDIO_CHANNELS = 1

// WebSocket settings
export const WS_RECONNECT_DELAY = 1000
export const WS_MAX_RECONNECT_ATTEMPTS = 5
