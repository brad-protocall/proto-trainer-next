---
status: pending
priority: p1
issue_id: "023"
tags: [code-review, security, docker, credentials]
dependencies: []
---

# Docker Compose Credentials Exposed

## Problem Statement

The `docker-compose.yml` file contains hardcoded database credentials that are visible in version control. Additionally, the PostgreSQL port is exposed to all network interfaces (0.0.0.0), making the database accessible from outside the machine.

**Why it matters**: Anyone with repository access has direct database credentials. On a network without proper firewall rules, the database is publicly accessible.

## Findings

**Location**: `docker-compose.yml` lines 8-10, 5-6

```yaml
environment:
  POSTGRES_USER: proto
  POSTGRES_PASSWORD: proto_dev_2026  # Hardcoded!
  POSTGRES_DB: proto_trainer
ports:
  - "5432:5432"  # Exposed to 0.0.0.0
```

**Security Issues**:
1. Credentials in git history forever (even if removed)
2. Weak password pattern (predictable: proto_dev_YEAR)
3. Port binding to all interfaces enables remote access
4. No network isolation

## Proposed Solutions

### Option A: Environment Variables (Recommended)
**Pros**: Secure, follows 12-factor app principles
**Cons**: Requires .env file setup for each developer
**Effort**: Small (15 min)
**Risk**: Low

```yaml
environment:
  POSTGRES_USER: ${POSTGRES_USER:-proto}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Database password required}
  POSTGRES_DB: ${POSTGRES_DB:-proto_trainer}
ports:
  - "127.0.0.1:5432:5432"  # Localhost only
```

### Option B: Docker Secrets
**Pros**: Most secure, no env vars
**Cons**: More complex setup, requires swarm mode
**Effort**: Medium (1 hour)
**Risk**: Low

## Recommended Action

[To be filled during triage]

## Technical Details

**Affected Files**:
- `docker-compose.yml`
- `.env.example` (add POSTGRES_PASSWORD)

## Acceptance Criteria

- [ ] No hardcoded credentials in docker-compose.yml
- [ ] Port bound to 127.0.0.1 only
- [ ] .env.example documents required variables
- [ ] Existing developers can still run `docker-compose up -d`

## Work Log

| Date | Action | Learnings |
|------|--------|-----------|
| 2026-01-26 | Created from code review | Security sentinel flagged as CRITICAL |

## Resources

- PR: commit 31b743e
- OWASP: Sensitive Data Exposure
