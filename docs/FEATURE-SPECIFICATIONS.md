# Proto Training Guide - Feature Specifications

Complete feature documentation for replicating this crisis counselor training app in any technology stack.

---

## Table of Contents

1. [Data Models](#1-data-models)
2. [Voice Training (Realtime API)](#2-voice-training-realtime-api)
3. [Chat Training (Text Mode)](#3-chat-training-text-mode)
4. [AI Evaluation System](#4-ai-evaluation-system)
5. [Assignment System](#5-assignment-system)
6. [Scenario Management](#6-scenario-management)
7. [One-Time Scenarios](#7-one-time-scenarios)
8. [Bulk Operations](#8-bulk-operations)
9. [Vector Store / Knowledge Base](#9-vector-store--knowledge-base)
10. [Recording System](#10-recording-system)
11. [Free Practice Mode](#11-free-practice-mode)
12. [Role-Based Access Control](#12-role-based-access-control)
13. [Category Filtering](#13-category-filtering)
14. [Counselor Search](#14-counselor-search)

---

## 1. Data Models

### Entity Relationship Diagram

```
User (Supervisor, Counselor)
├── Sessions (training conversations)
│   ├── TranscriptTurns (individual messages)
│   ├── Evaluation (AI feedback)
│   └── Recording (audio for voice sessions)
└── Assignments (training work items)

Scenario (training roleplay definitions)
├── Account (optional - organization context)
└── evaluator_context (file: .pdf, .docx, .txt)

Account (organization)
└── policies_vector_file_id (OpenAI vector store file)
```

### User

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| external_id | String(255) | Unique, for SSO integration (email in prototype) |
| display_name | String(255) | Human-readable name |
| email | String(255) | Email address |
| role | Enum | "supervisor" or "counselor" |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last modification time |

### Session

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | FK to User (nullable) |
| scenario_id | UUID | FK to Scenario (nullable, SET NULL on delete) |
| assignment_id | UUID | FK to Assignment (nullable) |
| model_type | String(50) | "phone", "chat", or "training" |
| status | Enum | "active", "completed", or "abandoned" |
| started_at | Timestamp | When session began |
| ended_at | Timestamp | When session ended |

**Relationships**: turns (TranscriptTurn[]), evaluation (Evaluation), recording (Recording)

### TranscriptTurn

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to Session (CASCADE delete) |
| turn_number | Integer | Sequence number in conversation |
| role | String(20) | "user" (counselor) or "assistant" (AI caller) |
| content | Text | Message text |
| captured_at | Timestamp | When message occurred |

### Evaluation

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to Session (CASCADE, UNIQUE) |
| evaluation_text | Text | AI-generated feedback |
| model_used | String(50) | e.g., "gpt-4.1" |
| transcript_turn_count | Integer | Number of turns evaluated |
| created_at | Timestamp | When evaluation was generated |

### Recording

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| session_id | UUID | FK to Session (CASCADE, UNIQUE) |
| file_path | Text | Absolute path to .wav file |
| duration_seconds | Integer | Recording length |
| file_size_bytes | Integer | File size |
| created_at | Timestamp | When recording was saved |

### Account

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | String(255) | Organization name |
| policies_procedures_path | Text | Legacy - local file path |
| policies_vector_file_id | String(255) | OpenAI file ID in vector store |

### Scenario

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | String(255) | Human-readable name (indexed) |
| description | Text | User-facing explanation |
| prompt | Text | Instructions for AI caller/chat bot |
| evaluator_context_path | Text | Path to evaluation context file |
| account_id | UUID | FK to Account (optional) |
| created_by | UUID | FK to User (RESTRICT) |
| is_one_time | Boolean | True = single-use scenario (indexed) |
| mode | String(20) | "phone" or "chat" |
| relevant_policy_sections | Text | Hint for evaluator (max 2000 chars) |
| category | String(20) | "onboarding", "refresher", "advanced", "assessment" (nullable) |
| created_at | Timestamp | Record creation time |
| updated_at | Timestamp | Last modification time |

### Assignment

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| account_id | UUID | FK to Account (SET NULL) |
| scenario_id | UUID | FK to Scenario (RESTRICT - prevents scenario deletion) |
| counselor_id | UUID | FK to User (CASCADE) |
| assigned_by | UUID | FK to User (RESTRICT) |
| status | String(20) | "pending", "in_progress", or "completed" |
| due_date | Timestamp | Optional deadline |
| supervisor_notes | Text | Notes from supervisor |
| session_id | UUID | FK to Session (SET NULL) |
| evaluation_id | UUID | FK to Evaluation (SET NULL) |
| created_at | Timestamp | When assigned |
| started_at | Timestamp | When counselor began |
| completed_at | Timestamp | When feedback submitted |

**Key Constraint**: Partial unique index on `(counselor_id, scenario_id, status)` WHERE status != 'completed'. This allows re-assignment after completion but prevents duplicate active assignments.

---

## 2. Voice Training (Realtime API)

### Purpose
Enable real-time voice conversations between counselors and an AI-simulated caller for crisis intervention training.

### Technical Requirements

**Audio Format**: PCM16, 24kHz, mono, little-endian

**Client-Side (Browser)**:
1. Request microphone access with 24kHz mono configuration
2. Use ScriptProcessor or AudioWorklet to capture audio chunks
3. Convert Float32Array samples to Int16Array (PCM16)
4. Base64-encode chunks for WebSocket transmission
5. Decode incoming base64 audio and play through AudioContext

**Server-Side**:
1. WebSocket endpoint accepts connection with parameters:
   - `model`: "phone" (default)
   - `user_id`: UUID for session tracking
   - `scenario_id`: UUID for custom prompt
   - `assignment_id`: UUID for training tracking
   - `record`: boolean to enable recording
2. Establish secondary WebSocket to OpenAI Realtime API
3. Relay messages bidirectionally between client and OpenAI
4. Capture transcript events server-side (user and assistant messages)
5. Store TranscriptTurn records with timestamps

**Message Flow**:
```
Client → Server: { "type": "input_audio_buffer.append", "audio": "<base64>" }
Client → Server: { "type": "input_audio_buffer.commit" }
Server → OpenAI: [relayed messages]
OpenAI → Server: { "type": "response.audio.delta", "delta": "<base64>" }
Server → Client: [relayed audio + transcript events]
```

**Transcript Ordering**: User transcription events arrive asynchronously. Sort by `captured_at` timestamp, not arrival order.

### Evaluation Trigger
When counselor clicks "Get Feedback":
1. POST to evaluation endpoint with session_id
2. Server retrieves all TranscriptTurn records for session
3. Sends to Evaluator API (see Section 4)
4. Returns evaluation text to client

---

## 3. Chat Training (Text Mode)

### Purpose
Enable text-based roleplay conversations for scenarios where voice isn't practical or for chat-based crisis support training.

### Technical Requirements

**Session Creation**:
1. POST to create session with optional `scenario_id` and `assignment_id`
2. Server calls OpenAI Responses API with scenario prompt
3. Returns session_id and AI's opening message
4. **Synchronous**: No polling - response returns immediately

**Message Exchange**:
1. POST message with full conversation history
2. Server calls OpenAI Responses API
3. Returns AI response text immediately

**Evaluation**:
1. POST with full message history
2. Server creates TranscriptTurn records for each message
3. Calls Evaluator API
4. Creates Evaluation record
5. Completes Assignment if linked
6. Returns evaluation text

**API Request Format**:
```json
{
  "messages": [
    { "role": "user", "content": "Hello, crisis line..." },
    { "role": "assistant", "content": "Hi, I'm calling because..." }
  ]
}
```

### Key Difference from Voice
- Full conversation history sent with each request (stateless on OpenAI side)
- Maximum 100 messages in history
- Uses stored prompt ID for system instructions

---

## 4. AI Evaluation System

### Purpose
Provide automated feedback on counselor performance using AI analysis of conversation transcripts.

### Split-Brain Architecture (CRITICAL)

**The Simulator and Evaluator must NEVER share context.**

| Component | What It Receives | What It Must NOT Receive |
|-----------|------------------|--------------------------|
| Simulator | Scenario caller prompt only | Evaluator context, policies, answers |
| Evaluator | Transcript + all context + policies | N/A (sees everything) |

**Why**: If the Simulator sees evaluation criteria, it could coach the counselor instead of testing them authentically.

### Evaluation Pipeline

**Input**:
```json
{
  "transcript": [
    { "role": "user", "content": "...", "timestamp": 1234567890 },
    { "role": "assistant", "content": "..." }
  ],
  "model_type": "phone" | "chat",
  "scenario_id": "uuid" (optional)
}
```

**Processing Steps**:

1. **Format Transcript**:
   - Sort by timestamp
   - Filter empty messages
   - Format: "Counselor: ...\n\nCaller: ..."

2. **Load Context** (if scenario provided):
   - Extract text from scenario's evaluator_context file (PDF/DOCX)
   - Load account policies via vector store file_search tool
   - Include relevant_policy_sections hint

3. **Build API Request**:
   - Use stored prompt ID (manages system instructions)
   - Add file_search tool if vector store configured
   - Include formatted transcript and context

4. **Call OpenAI Responses API** (v3 synchronous)

5. **Store Results**:
   - Create Evaluation record
   - Complete Assignment if linked

**Output**:
```json
{
  "evaluation": "AI feedback text with grade and specific feedback",
  "model_type": "phone",
  "transcript_turns": 42
}
```

### Context Priority Hierarchy
1. Scenario evaluator_context_path (highest priority)
2. Account policies via vector store
3. relevant_policy_sections hint (guides search)

---

## 5. Assignment System

### Purpose
Track counselor training work items with lifecycle management.

### Status Lifecycle

```
┌─────────┐
│ pending │ ← Initial state (supervisor assigns)
└────┬────┘
     │ Counselor clicks "Start"
     ↓
┌──────────────┐
│ in_progress  │ ← Training active
└────┬─────────┘
     │ Get Feedback (evaluation complete)
     ↓
┌───────────┐
│ completed │ ← Terminal state
└───────────┘
```

**Valid Transitions**:
- pending → in_progress (counselor starts)
- in_progress → completed (after evaluation)
- in_progress → pending (supervisor resets abandoned session)

### State Machine Methods
```
assignment.can_transition_to(status) → boolean
assignment.start() → sets status to in_progress, records started_at
assignment.complete(session_id, evaluation_id) → sets status to completed
assignment.reset() → supervisor can reset to pending
```

### Key Behaviors

**Re-assignment After Completion**: The partial unique index allows creating a new assignment for the same counselor-scenario pair after the previous one is completed. This enables additional practice on the same scenario.

**Deletion Constraints**: Cannot delete a scenario that has active assignments (RESTRICT foreign key).

---

## 6. Scenario Management

### Purpose
Define training roleplay situations with AI caller personas and evaluation criteria.

### Scenario Components

| Component | Purpose |
|-----------|---------|
| `title` | Human-readable identifier |
| `prompt` | Instructions for AI caller behavior |
| `description` | Explanation shown to counselors |
| `mode` | "phone" (voice) or "chat" (text) |
| `evaluator_context` | File with evaluation guidance |
| `relevant_policy_sections` | Text hint for policy search |
| `category` | Classification for filtering |
| `account_id` | Optional organization link |

### Evaluator Context

**Purpose**: Guidance for AI evaluator about what to assess

**Supported Formats**:
- File upload: PDF, DOCX, TXT, MD (max 10MB)
- Text input: Direct paste (max 50,000 characters)

**Storage**: `uploads/evaluator_context/{scenario_id}/filename`

**Retrieval**: Extracted as plain text for evaluation

### Mode Constraint
Cannot change scenario mode after assignments exist (prevents breaking active training).

---

## 7. One-Time Scenarios

### Purpose
Create custom scenarios for specific counselors without cluttering the reusable scenario library.

### Behavior

**Creation**: POST to `/scenarios/one-time` with:
- Scenario details (title, prompt, mode, etc.)
- counselor_id (who should receive it)
- Optional due_date

**Atomic Transaction**:
1. Create Scenario with `is_one_time = true`
2. Create Assignment linking scenario to counselor
3. Both commit together or neither does

**Visibility**:
- One-time scenarios (`is_one_time = true`) do NOT appear in scenario dropdown
- Only visible through the specific assignment

### Use Case
Supervisor creates custom scenario for one counselor's specific training need without adding to shared library.

---

## 8. Bulk Operations

### Bulk Assignments

**Purpose**: Assign multiple scenarios to multiple counselors in one operation.

**Input**:
```json
{
  "counselor_ids": ["uuid1", "uuid2", "uuid3"],
  "scenario_ids": ["uuid-a", "uuid-b"],
  "due_date": "2026-02-01T00:00:00Z",
  "supervisor_notes": "Complete by end of week"
}
```

**Behavior**:
- Creates N × M assignments (counselors × scenarios)
- Maximum 500 assignments per request
- Skips pairs where active (pending/in_progress) assignment exists
- Returns count of created vs. skipped

**Response**:
```json
{
  "created": 5,
  "skipped": 1,
  "skipped_pairs": [{ "counselor_id": "...", "scenario_id": "..." }]
}
```

### Bulk Scenario Import

**Purpose**: Import multiple scenarios from CSV/JSON data.

**Input**:
```json
{
  "scenarios": [
    {
      "title": "Caller suicidal ideation",
      "prompt": "You are calling because...",
      "description": "Practice de-escalation",
      "evaluator_context": "Focus on safety planning...",
      "mode": "phone",
      "category": "advanced"
    }
  ]
}
```

**Behavior**:
- Maximum 100 scenarios per request
- Skips duplicates (case-insensitive title matching)
- Creates .txt file for evaluator_context if provided

**Response**:
```json
{
  "created": 15,
  "skipped": 2,
  "created_titles": ["..."],
  "skipped_titles": ["..."]
}
```

---

## 9. Vector Store / Knowledge Base

### Purpose
Enable semantic search of organization policies during evaluation without including full documents in context.

### Architecture

**Vector Store**: OpenAI vector store containing organization policy documents

**Upload Flow**:
1. Supervisor uploads policy file (PDF, DOCX, TXT, MD)
2. File saved to local disk as backup
3. File uploaded to OpenAI, added to vector store
4. `account.policies_vector_file_id` stores the file ID

### Integration with Evaluator

When evaluating a transcript:
1. If `policies_vector_file_id` exists → add file_search tool to request
2. If no vector store → extract local file text (truncate at 50k chars)
3. `relevant_policy_sections` hint guides the search query

**File Search Tool**:
```json
{
  "type": "file_search",
  "vector_store_ids": ["vs_..."]
}
```

### Benefits
- Only relevant chunks retrieved (not entire document)
- Avoids context length errors
- Semantic search finds related content even if wording differs

---

## 10. Recording System

### Purpose
Capture audio from voice training sessions for review and quality assurance.

### Recording Pipeline

**Enable**: WebSocket connection with `?record=true`

**Capture**:
1. User audio chunks accumulated with timestamps
2. AI audio chunks accumulated with timestamps
3. Each chunk: (timestamp, base64_pcm16_bytes)

**Encoding** (after session ends):
1. Combine user + AI audio chronologically
2. Decode base64 → PCM16 bytes
3. Encode to WAV format (24kHz, 16-bit, mono)

**Storage**:
- File: `recordings/{session_id}.wav`
- Database: Recording record with file_path, duration, size

### Retrieval

**List**: GET `/recordings` with optional counselor_id filter

**Download**: GET `/recordings/{id}/download`
- Supports HTTP Range requests for streaming
- Returns WAV file with Accept-Ranges header

---

## 11. Free Practice Mode

### Purpose
Allow counselors to practice without assigned scenarios.

### Behavior

**Session Creation**: POST to `/chat/sessions` without scenario_id

**AI Opening**: Generic prompt: "What would you like to practice today?"

**Conversation**: Normal message exchange

**Evaluation**: Uses generic crisis counseling criteria (no scenario-specific context)

### Use Case
Counselor wants to practice general skills without waiting for specific assignment.

---

## 12. Role-Based Access Control

### Roles

| Role | Capabilities |
|------|--------------|
| **Supervisor** | Create scenarios, manage all assignments, view all counselors |
| **Counselor** | View own assignments, complete training, get feedback |

### Endpoint Authorization

| Action | Counselor | Supervisor |
|--------|-----------|------------|
| List own assignments | ✅ | ✅ |
| List all assignments | ❌ | ✅ |
| Update assignment status | Own only | All |
| Update assignment due_date | ❌ | ✅ |
| Create assignment | ❌ | ✅ |
| Delete assignment | ❌ | ✅ |
| Create scenario | ❌ | ✅ |
| List scenarios | ✅ | ✅ |

---

## 13. Category Filtering

### Purpose
Organize scenarios by training purpose for easier discovery.

### Categories

| Category | Purpose |
|----------|---------|
| `onboarding` | New counselor initial training |
| `refresher` | Periodic skill reinforcement |
| `advanced` | Complex scenarios for experienced counselors |
| `assessment` | Formal evaluation scenarios |
| `null` | Uncategorized |

### Filtering

**Scenarios**: Filter by category in list endpoint

**Assignments**: Filter by scenario category (derived from linked scenario)

---

## 14. Counselor Search

### Purpose
Efficiently find counselors when creating assignments, especially with large counselor lists.

### Implementation

**Typeahead Search**: As supervisor types, filter counselor list by:
- display_name (partial match)
- email (partial match)

**Selection**: Click to add counselor to selection for bulk assignment

### API Support
GET `/users?role=counselor` returns all counselors
Frontend implements client-side filtering for typeahead

---

## Replication Checklist

To replicate this system in another stack:

### Database
- [ ] User, Session, TranscriptTurn, Evaluation, Recording, Account, Scenario, Assignment models
- [ ] Partial unique index on Assignment for re-assignment support
- [ ] CHECK constraints for status enums
- [ ] Cascade/Restrict delete relationships

### Real-time Voice
- [ ] WebSocket relay to OpenAI Realtime API
- [ ] PCM16 audio handling (24kHz, mono)
- [ ] Server-side transcript capture
- [ ] Optional recording pipeline

### Chat
- [ ] Synchronous Responses API integration
- [ ] Conversation history management
- [ ] Free practice mode (no scenario required)

### Evaluation
- [ ] Split-brain architecture (simulator ≠ evaluator context)
- [ ] Vector store integration for policy search
- [ ] Stored prompt management
- [ ] Evaluation record persistence

### Assignment Management
- [ ] Status state machine
- [ ] Bulk operations with duplicate detection
- [ ] One-time scenario atomic creation
- [ ] Role-based access control

### File Management
- [ ] Evaluator context upload/download
- [ ] Policy file upload with vector store integration
- [ ] Recording storage with range request support
