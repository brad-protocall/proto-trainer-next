# LiveKit Integration Spike

## Goal

Test whether LiveKit can replace our custom `ws-server/` WebSocket relay for voice training with OpenAI Realtime API.

## Success Criteria

| Criteria | How to Verify |
|----------|---------------|
| ✅ Voice conversation works | Can talk to AI caller, hear responses |
| ✅ OpenAI Realtime integration | Uses our existing prompts/scenarios |
| ✅ Transcripts captured | Speech-to-text available for evaluation |
| ✅ Simpler than current | Less code, fewer moving parts |
| ✅ Auth model clearer | Token-based, not query param userId |

## Out of Scope (for spike)

- Full migration of existing voice training page
- Recording/WAV export
- Session persistence to database
- Assignment integration
- Production deployment

## Approach

### Phase 1: Setup (~30 min)

1. Create LiveKit Cloud account (free tier)
2. Get API credentials
3. Install packages:
   ```bash
   npm install @livekit/components-react @livekit/components-styles livekit-client
   ```

### Phase 2: Minimal Agent (~1-2 hours)

Create a minimal LiveKit agent that:
- Connects to OpenAI Realtime API
- Uses a hardcoded test prompt (from our existing scenarios)
- Responds via voice

Options:
- **Option A**: Use LiveKit's hosted agent (if they support OpenAI Realtime directly)
- **Option B**: Create a Node.js agent using `@livekit/agents`

### Phase 3: React Frontend (~1 hour)

Create a test page at `/spike/livekit` that:
- Connects to LiveKit room
- Shows microphone controls
- Displays transcript (if available)
- Basic UI only - not production styled

### Phase 4: Evaluate

Answer these questions:
1. Does voice quality match or exceed current implementation?
2. Is connection more stable than raw WebSocket?
3. Can we access transcripts for our evaluation feature?
4. What's the token/auth model? Does it solve our security issue?
5. What would full migration require?

## Decision Point

After spike:
- **GO**: LiveKit works well → Create full migration plan
- **NO-GO**: Issues found → Document why, keep current approach

## Files to Create

```
src/app/spike/
  livekit/
    page.tsx          # Test page
    components/
      VoiceAgent.tsx  # LiveKit voice component
```

Maybe also:
```
livekit-agent/        # If we need a custom agent (Option B)
  index.ts
  package.json
```

## Resources

- LiveKit Agents Docs: https://docs.livekit.io/agents/overview/
- OpenAI Integration: https://docs.livekit.io/agents/integrations/openai/
- React Quickstart: https://docs.livekit.io/realtime/quickstarts/react/

## Timebox

**Maximum 4 hours**. If blocked significantly, document blockers and make GO/NO-GO decision based on available information.
