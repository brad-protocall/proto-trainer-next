---
title: LiveKit Agent Not Dispatching - Stale Cloud Container After Inactivity
category: runtime-errors
component: livekit-cloud-agent
symptoms:
  - Voice training UI shows "Connected" (green dot) but stuck on "Waiting for agent..."
  - Client successfully publishes microphone track
  - No agent dispatch logs in Pi journalctl
  - lk agent logs shows "shut down due to inactivity"
root_cause: LiveKit Cloud agent container went dormant after inactivity and failed to auto-wake on new session request
date_solved: 2026-02-06
severity: high
tags:
  - livekit
  - voice-training
  - cloud-agent
  - deployment
  - container-lifecycle
related:
  - docs/solutions/integration-issues/livekit-migration-code-review-2026-02-03.md
  - docs/solutions/prevention-strategies/cross-process-integration-patterns.md
---

# LiveKit Agent Not Dispatching - Stale Container

## Problem

Voice training shows "Connected" but permanently stuck on "Waiting for agent..." The agent never joins the room.

## Symptoms

- Green "Connected" dot in UI
- "publishing track" in browser console (microphone working)
- Agent state never progresses past initial state
- `lk agent logs` returns: "The agent has shut down due to inactivity. It will automatically start again when a new session begins."

## Investigation Steps

This was a layer-by-layer elimination:

### 1. Client side working?
**YES** - Screenshot showed green "Connected", track publishing in console.

### 2. Ngrok reachable?
```bash
curl -s -o /dev/null -w "%{http_code}" https://proto-trainer.ngrok.io/api/internal/sessions
# Result: 405 (Method Not Allowed) = correct, GET not POST
```
**YES** - 405 means the route exists and responded.

### 3. Agent secrets present?
```bash
lk agent secrets
# All 3 secrets present: NEXT_APP_URL, INTERNAL_SERVICE_KEY, OPENAI_API_KEY
```
**YES** - All required secrets exist.

### 4. API callback working?
```bash
curl -X POST https://proto-trainer.ngrok.io/api/internal/sessions \
  -H "X-Internal-Service-Key: <YOUR_INTERNAL_SERVICE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"type":"free_practice","userId":"00000000-0000-0000-0000-000000000000"}'
# Result: 500
```
**500 error** - but this was a red herring (fake UUID caused foreign key violation).

### 5. Check Pi logs
```bash
ssh brad@pai-hub.local 'journalctl -u proto-trainer-next -n 30 --no-pager'
```
Showed P2003 foreign key errors at 22:48 - but these were from our test curl, NOT from the user's actual test at 22:39.

### 6. Key insight: Zero logs from actual user test
The user tested at ~22:39. Pi logs showed ZERO entries between 22:31 (service start) and 22:48 (our test curl). The agent never called the Pi API at all.

**Conclusion: Agent not dispatching, not an API problem.**

### 7. Redeploy
```bash
cd livekit-agent && lk agent deploy
```
Voice worked immediately after redeployment.

## Root Cause

LiveKit Cloud agent containers sleep after inactivity. The auto-wake mechanism failed silently - the container didn't spin up when a new room was created with agent dispatch metadata. A fresh deployment creates a new container that dispatches correctly.

## Solution

```bash
cd livekit-agent && lk agent deploy
# Wait for "Deployed agent" confirmation
# Test voice session in browser
```

## Quick Diagnostic Checklist

When voice shows "Waiting for agent...":

```
1. Check Pi logs for agent callbacks:
   ssh brad@pai-hub.local 'journalctl -u proto-trainer-next --since "10 min ago" | grep internal'

2. If NO log entries → agent dispatch problem:
   lk agent logs        # Check agent status
   cd livekit-agent && lk agent deploy   # Redeploy

3. If YES log entries with errors → API problem:
   Read the error message in Pi logs
   Common: foreign key (user doesn't exist), auth (key mismatch)
```

## Decision Tree

```
Voice "Waiting for agent..."
├── Are there POST /internal/sessions in Pi logs?
│   ├── NO → Agent dispatch problem
│   │   └── Fix: cd livekit-agent && lk agent deploy
│   └── YES → API problem
│       ├── 500 + P2003 → User doesn't exist in Pi DB
│       ├── 401/403 → INTERNAL_SERVICE_KEY mismatch
│       └── 400 → Invalid request metadata
```

## Important Notes

- `lk` CLI is installed on Mac, NOT on Pi
- Agent logs are lost when container shuts down - check immediately after failure
- The "shut down due to inactivity" message from `lk agent logs` is about the log endpoint, not necessarily about the agent's state during your test
