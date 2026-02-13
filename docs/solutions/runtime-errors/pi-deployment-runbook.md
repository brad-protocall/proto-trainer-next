# Pi Deployment Runbook

Comprehensive guide for deploying proto-trainer-next to Raspberry Pi, including gotchas discovered through painful debugging sessions (2026-02-04 through 2026-02-11).

---

## Quick Deploy

```bash
# From Mac — the ONLY way to deploy:
npm run deploy:pi        # Dry run (preview what would sync)
npm run deploy:pi:go     # Sync files (always excludes .env)
npm run deploy:pi:full   # Sync + build + restart service on Pi
```

**NEVER use raw rsync.** It caused outages TWICE by overwriting Pi's `.env` with local values. The deploy script (`scripts/deploy-pi.sh`) always excludes `.env`, `node_modules/`, `.next/`, and platform-specific files.

---

## Pi Environment

| Setting | Value |
|---------|-------|
| Directory | `~/apps/proto-trainer-next` (NOT `~/proto-trainer-next`) |
| Database | PostgreSQL (see Pi `.env` for password) |
| Service | `proto-trainer-next` (systemd) |
| LiveKit URL | `wss://proto-trainer-next-amw48y2e.livekit.cloud` |
| ngrok URL | `https://proto-trainer.ngrok.io` |

### Pi vs Local Differences

| Setting | Local (Mac) | Pi |
|---------|-------------|-----|
| Database | SQLite (`file:./dev.db`) | PostgreSQL (`proto:<PI_PASSWORD>@localhost`) |
| Database password | See local `.env` | See Pi `.env` |
| LiveKit URL | Same cloud URL | Same cloud URL |
| Node modules | macOS binaries | ARM binaries |
| `.next/` build | macOS Prisma engine | Linux ARM Prisma engine |

**Critical**: Pi and local have DIFFERENT database passwords. Never copy local `.env` to Pi.

---

## Deployment Gotchas

### Build & Dependencies

1. **Must rebuild on Pi**: rsync from macOS includes `.next/` with macOS Prisma binaries — always run `npx prisma generate && npm run build` on Pi after syncing.

2. **Dev deps needed for build**: Use `npm install` (not `--production`) — Next.js build needs `@types/papaparse`, `eslint`, etc. as devDependencies.

3. **OpenAI client lazy-init**: The OpenAI client is lazy-initialized via Proxy to avoid crashes during build when `OPENAI_API_KEY` isn't available. Don't change this pattern.

4. **livekit-agent excluded from tsconfig**: Has its own eslint config that breaks the main build without its own devDeps. Keep the exclusion.

### Environment & Config

5. **`.env` is NOT rsynced**: Must already exist on Pi with correct values (DATABASE_URL, OPENAI_API_KEY, INTERNAL_SERVICE_KEY, etc.). The deploy script enforces this.

6. **NEXT_PUBLIC_ vars require rebuild**: `NEXT_PUBLIC_*` env vars are baked into the Next.js build at compile time. Changing `.env` + restart is NOT enough — must run `npm run build` on Pi. Regular env vars (DATABASE_URL, OPENAI_API_KEY, etc.) only need a restart.

7. **Don't edit Pi `.env` with values from local**: Pi and local have DIFFERENT database passwords. When editing with nano, only change the specific lines you intend to change. The systemd override at `/etc/systemd/system/proto-trainer-next.service.d/override.conf` also sets the DATABASE_URL.

### Database

8. **Prisma baselining**: If you get P3005 "schema not empty" error, baseline existing migrations with `prisma migrate resolve --applied <migration_name>` before running `migrate deploy`.

9. **Seed drift**: Adding users to `prisma/seed.ts` doesn't automatically add them to Pi. Must either re-run `npx prisma db seed` on Pi or INSERT directly:
   ```bash
   sudo -u postgres psql -d proto_trainer
   INSERT INTO "User" (id, name, email, role, "accountId")
   VALUES ('...', 'Name', 'email@example.com', 'counselor', 'account-id')
   ON CONFLICT DO NOTHING;
   ```

### SSH & Service Management

10. **sudo in SSH one-liners fails**: "Interactive authentication required" — must SSH interactively for `sudo systemctl restart proto-trainer-next`:
    ```bash
    ssh brad@pai-hub.local
    # then on Pi:
    sudo systemctl restart proto-trainer-next
    ```

### ngrok

11. **ngrok OAuth blocks LiveKit agent**: If ngrok has `--oauth` enabled, all requests get 302 redirected to `idp.ngrok.com/oauth2`. The LiveKit agent makes plain HTTP callbacks and can't authenticate through OAuth.

    **Detection**:
    ```bash
    curl -s -o /dev/null -w "%{http_code}" https://proto-trainer.ngrok.io/api/internal/sessions
    # 405 = working (Method Not Allowed, correct)
    # 302 = ngrok OAuth blocking
    # 000 = ngrok not running
    ```

    **Fix**: Restart ngrok without `--oauth`:
    ```bash
    ngrok http --url=proto-trainer.ngrok.io http://pai-hub.local:3003
    ```

---

## LiveKit Voice System

### Reference

| Resource | Value |
|----------|-------|
| Dashboard | https://cloud.livekit.io |
| Agent ID | CA_GUpZ97G5vvd3 |
| Cloud Region | US East B |
| CLI | `lk` (installed via brew, **Mac only**) |
| Agent logs | `lk agent logs` |
| Redeploy agent | `cd livekit-agent && lk agent deploy` |
| Agent secrets | `lk agent secrets` |

### Required Secrets

| Secret | Purpose |
|--------|---------|
| `NEXT_APP_URL` | Where agent calls back to (e.g., `https://proto-trainer.ngrok.io`) |
| `INTERNAL_SERVICE_KEY` | Must match Pi's `INTERNAL_SERVICE_KEY` env var |
| `OPENAI_API_KEY` | For OpenAI Realtime API |

### Secrets Gotcha: Comma-Separated Values

**Problem**: LiveKit CLI `--secrets` flag uses commas to separate multiple KEY=VALUE pairs. This corrupts URLs:

```bash
# WRONG — comma interpreted as separator, corrupts NEXT_APP_URL
lk agent update-secrets --secrets "NEXT_APP_URL=https://example.com,INTERNAL_SERVICE_KEY=secret"
# Results in: NEXT_APP_URL=https://example.com (truncated)
#             INTERNAL_SERVICE_KEY not set correctly
```

**Correct**: Use separate `--secrets` flags:
```bash
lk agent update-secrets \
  --secrets "NEXT_APP_URL=https://proto-trainer.ngrok.io" \
  --secrets "INTERNAL_SERVICE_KEY=<YOUR_INTERNAL_SERVICE_KEY>" \
  --secrets "OPENAI_API_KEY=sk-..."
```

**`--overwrite` warning**: This flag **removes ALL existing secrets** and replaces with only what you specify. Forgetting `OPENAI_API_KEY` means the agent silently fails (no API key = no LLM responses, shows as "job is unresponsive").

### Stale Container

If voice shows "Waiting for agent..." but ngrok/Pi/secrets are all fine, the agent container may be stale. This happens when the agent code changes but the container isn't redeployed.

**Fix** (run from Mac):
```bash
cd livekit-agent && lk agent deploy
```

See also: `docs/solutions/runtime-errors/livekit-agent-stale-container-dispatch-failure.md`

---

## Voice Session Debugging Decision Tree

When voice sessions fail, check in this order:

```
Voice "Waiting for agent..."
│
├── 1. Check Pi logs for agent callbacks:
│   ssh brad@pai-hub.local 'journalctl -u proto-trainer-next --since "10 min ago" | grep internal'
│
├── If NO log entries → Agent dispatch problem
│   ├── lk agent logs          (check agent status — run from Mac)
│   └── cd livekit-agent && lk agent deploy   (redeploy fixes stale container)
│
├── If YES log entries with errors → API problem
│   ├── P2003 foreign key → User doesn't exist in Pi DB (see Seed Drift above)
│   ├── 401/403 → INTERNAL_SERVICE_KEY mismatch between Pi and agent secrets
│   └── 400 → Invalid request metadata
│
├── 2. Check ngrok is running:
│   curl -s -o /dev/null -w "%{http_code}" https://proto-trainer.ngrok.io/api/internal/sessions
│   (405 = working, 000 = ngrok not running, 302 = OAuth blocking)
│
├── 3. Check agent secrets: lk agent secrets (from Mac)
│   Need: NEXT_APP_URL, INTERNAL_SERVICE_KEY, OPENAI_API_KEY
│
└── 4. Check Pi service:
    ssh brad@pai-hub.local 'journalctl -u proto-trainer-next -n 50'
```

### Common Failure Modes Quick Reference

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Waiting for agent..." + no Pi logs | Stale agent container | `cd livekit-agent && lk agent deploy` |
| Malformed hostname in error | Secrets set with comma separator | Re-set with separate `--secrets` flags |
| "job is unresponsive" | Missing `OPENAI_API_KEY` | `lk agent update-secrets --secrets "OPENAI_API_KEY=sk-..."` |
| "Session creation failed" | `INTERNAL_SERVICE_KEY` mismatch or API unreachable | Compare Pi's env var with `lk agent secrets` |
| "Session creation failed" + no Pi logs | ngrok OAuth blocking | Restart ngrok without `--oauth` |
| P2003 foreign key error | User not in Pi database | INSERT user or re-run seed |
| 500 errors after deploy | Didn't rebuild on Pi | Run `npx prisma generate && npm run build` |
| New env var not taking effect | `NEXT_PUBLIC_*` needs rebuild | Run `npm run build`, not just restart |

---

## Full Deploy Checklist

For a standard feature deploy:

```bash
# 1. From Mac: sync files
npm run deploy:pi:full

# 2. If new npm dependencies were added, SSH to Pi:
ssh brad@pai-hub.local
cd ~/apps/proto-trainer-next
npm install

# 3. If Prisma schema changed:
npx prisma migrate deploy
npx prisma generate

# 4. Rebuild (deploy:pi:full does this, but if manual):
npm run build

# 5. Restart service:
sudo systemctl restart proto-trainer-next

# 6. Verify:
journalctl -u proto-trainer-next -n 20

# 7. If voice features changed, from Mac:
cd livekit-agent && lk agent deploy
```

For ngrok (must be running for voice):
```bash
# On Mac:
ngrok http --url=proto-trainer.ngrok.io http://pai-hub.local:3003
# NO --oauth flag!
```
