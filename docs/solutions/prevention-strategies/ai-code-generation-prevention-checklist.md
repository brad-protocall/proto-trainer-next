# AI Code Generation Prevention Checklist

**Context**: After Ralph autonomous code generation for scenario generation feature (Issue #12), code review identified 16 findings across 4 pattern categories. This document provides prevention strategies to catch similar issues earlier in future autonomous sessions.

**Generated**: 2026-02-10
**Status**: Active Prevention Strategy
**Applies to**: Ralph, Claude autonomous sessions, and manual AI-assisted development

---

## Pattern Analysis Summary

From the 16 code review findings:

| Pattern Category | Count | Severity | Root Cause |
|-----------------|-------|----------|------------|
| **A: Hardcoded values vs. canonical sources** | 4 | P1-P2 | AI duplicated constants instead of importing |
| **B: Missed codebase conventions** | 5 | P1-P2 | AI unaware of documented patterns in CLAUDE.md |
| **C: Weaker validation than existing code** | 4 | P2 | AI didn't match validation rigor of similar endpoints |
| **D: Pre-existing bugs discovered** | 3 | P1 | Review caught bugs in code AI was referencing |

**Key Insight**: Most issues weren't AI "hallucinations" — they were AI following **weaker examples** or **not finding the best examples** in the codebase.

---

## Post-Generation Checklist (Run After Every Autonomous Session)

This checklist should be run **before** marking autonomous work complete. Estimated time: 15-20 minutes.

### 1. Canonical Source Verification (5 min)

**Problem**: AI duplicates enum values, constants, or type definitions instead of importing from single source of truth.

**Check**:
```bash
# Find hardcoded category arrays (should import from validators.ts)
grep -r "cohort_training.*onboarding.*expert_skill" src/ --include="*.ts" --include="*.tsx" | grep -v validators.ts | grep -v types/

# Find hardcoded skill arrays (should import from skills.ts)
grep -r "risk-assessment.*safety-planning.*de-escalation" src/ --include="*.ts" --include="*.tsx" | grep -v skills.ts

# Find duplicate type definitions (check for "extends" or duplicated fields)
grep -rn "interface.*Scenario" src/types/ src/components/ --include="*.ts" --include="*.tsx" -A 5 | grep -E "(title|prompt|description|category)" | wc -l
# If count > 1, investigate duplicates
```

**Prevention Pattern**:
```typescript
// ❌ BAD: Hardcoded in component
const VALID_CATEGORIES = ['cohort_training', 'onboarding', 'expert_skill_path'];

// ✅ GOOD: Import from canonical source
import { ScenarioCategoryValues } from '@/lib/validators';
const VALID_CATEGORIES = [...ScenarioCategoryValues, ''];
```

**Auto-fix**: Add ESLint rule to flag hardcoded enum values:
```javascript
// .eslintrc.js
{
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'ArrayExpression:has(Literal[value="cohort_training"])',
        message: 'Import ScenarioCategoryValues from @/lib/validators'
      }
    ]
  }
}
```

### 2. Codebase Convention Compliance (5 min)

**Problem**: AI uses raw `fetch()` instead of `authFetch`, loads files as strings instead of using accessors, skips rate limiting on LLM endpoints.

**Check**:
```bash
# Find raw fetch calls in components (should use authFetch)
grep -rn "await fetch(" src/components/ --include="*.tsx" | grep -v authFetch

# Find direct file reads in API routes (should use accessor pattern)
grep -rn "readFile.*\.txt" src/app/api/ --include="*.ts" -B 2 | grep -v "loadPrompt"

# Find LLM endpoints without rate limiting
grep -rn "openai\." src/app/api/ --include="*.ts" -A 10 | grep -B 10 "export async function POST" | grep -L "rateLimit"
```

**Prevention Pattern**:
```typescript
// ❌ BAD: Raw fetch without auth
const response = await fetch('/api/scenarios', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

// ✅ GOOD: authFetch from useAuth hook
const { authFetch } = useAuth();
const response = await authFetch('/api/scenarios', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

**Known Pitfalls Reference** (from CLAUDE.md line 306-311):
1. camelCase/snake_case — API returns camelCase, some types use snake_case
2. **Auth headers — API calls need `x-user-id` header (see `src/lib/fetch.ts`)**
3. Modal timing — Never auto-close modals showing actionable feedback
4. Bulk operations — Always handle partial success case

### 3. Validation Parity Check (5 min)

**Problem**: AI-generated validation schemas missing `.max()` constraints, timeout values, or error handling that exists in similar endpoints.

**Check**:
```bash
# Compare new schema with existing (e.g., scenario schemas)
diff <(grep -A 20 "export const createScenarioSchema" src/lib/validators.ts) \
     <(grep -A 20 "export const generateScenarioSchema" src/lib/validators.ts)

# Find schemas missing .max() on string fields
grep -rn "z.string()" src/lib/validators.ts src/app/api/ --include="*.ts" -A 1 | grep -v ".max("

# Check timeout consistency across OpenAI calls
grep -rn "timeout:" src/lib/openai.ts -A 2 -B 2 | grep -E "[0-9]+" -o | sort | uniq -c
```

**Prevention Pattern**:
```typescript
// ❌ WEAK: No max length
export const generateScenarioSchema = z.object({
  sourceText: z.string().min(50),
  evaluatorContext: z.string(),  // No max!
});

// ✅ STRONG: Match existing validation rigor
export const generateScenarioSchema = z.object({
  sourceText: z.string().min(50).max(15000),
  evaluatorContext: z.string().max(5000),  // Same as external API
});
```

**Validation Checklist**:
- [ ] All string fields have `.max()` limits
- [ ] All LLM calls have reasonable timeouts (10-30s)
- [ ] Parse failures caught and return 400 (not 500)
- [ ] Rate limiting on expensive operations (P2 for MVP, P1 for production)

### 4. File Path & Accessor Pattern Check (3 min)

**Problem**: AI passed file **path** to LLM instead of file **content** (evaluator context bug).

**Check**:
```bash
# Find file paths being sent to OpenAI without being read
grep -rn "Path:" src/lib/openai.ts src/app/api/ --include="*.ts" -A 5 | grep "openai\."

# Find loadPrompt usage (correct pattern)
grep -rn "loadPrompt" src/lib/openai.ts -A 2
```

**Prevention Pattern**:
```typescript
// ❌ BAD: Passing file path to LLM
const contextPath = scenario.evaluatorContextPath;
const prompt = `Context: ${contextPath}`;  // LLM sees "uploads/context.txt", not content!

// ✅ GOOD: Load content via accessor
const contextContent = scenario.evaluatorContextPath
  ? await loadEvaluatorContext(scenario.evaluatorContextPath)
  : '';
const prompt = `Context: ${contextContent}`;
```

### 5. Type Safety Audit (2 min)

**Problem**: AI uses weaker types (e.g., `z.array(z.string())` for skills instead of `SkillSchema` enum).

**Check**:
```bash
# Check for any type assertions or type widening
npx tsc --noEmit --strict

# Find weak array types that should be enums
grep -rn "z.array(z.string())" src/lib/validators.ts -B 2 | grep -E "(skill|category|mode)"
```

**Prevention Pattern**:
```typescript
// ❌ WEAK: Free-text strings
skills: z.array(z.string())  // AI could return invalid skills

// ✅ STRONG: Use existing enum
import { SkillSchema } from '@/lib/skills';
skills: z.array(SkillSchema)  // Token-level constraint in zodResponseFormat
```

---

## CLAUDE.md Additions (Paste After "Bug Prevention Patterns")

Add this section to `/Users/brad.pendergraft/claude-projects/Protocall/proto-trainer-next/CLAUDE.md` after line 426:

```markdown
### AI Code Generation Patterns (2026-02-10)

After Ralph autonomous scenario generation feature, code review identified common AI patterns that need prevention.

#### 1. Always Import from Canonical Sources

**Problem**: AI duplicates enum values instead of importing.

**Pattern**:
```typescript
// ❌ AI tends to do this
const CATEGORY_OPTIONS = ['cohort_training', 'onboarding', ...];

// ✅ Do this instead
import { ScenarioCategoryValues } from '@/lib/validators';
const CATEGORY_OPTIONS = [...ScenarioCategoryValues];
```

**Locations of truth**:
- Categories: `src/lib/validators.ts` → `ScenarioCategoryValues`
- Skills: `src/lib/skills.ts` → `VALID_SKILLS` / `SkillSchema`
- Modes: `src/lib/validators.ts` → `ScenarioModeSchema`

#### 2. Use Accessor Pattern for File Content

**Problem**: AI passes file paths to functions expecting file content.

**Pattern**:
```typescript
// ❌ Wrong: Path sent to LLM sees "uploads/context.txt" string
const prompt = buildPrompt(scenario.evaluatorContextPath);

// ✅ Right: Load content first
const content = scenario.evaluatorContextPath
  ? await loadEvaluatorContext(scenario.evaluatorContextPath)
  : '';
const prompt = buildPrompt(content);
```

**Accessor helpers**:
- `loadPrompt(filename)` → loads from `prompts/` directory
- `loadEvaluatorContext(path)` → loads evaluator context file
- Never pass raw paths to LLM prompts

#### 3. Match Validation Rigor of Similar Endpoints

**Problem**: AI uses weaker validation than existing endpoints.

**Checklist**:
- [ ] String fields have `.max()` limits (check similar schemas)
- [ ] Timeouts on LLM calls (10-30s, check existing calls)
- [ ] Parse failures return 400 not 500
- [ ] Use enum schemas where possible (e.g., `SkillSchema` not `z.string()`)

**Example**:
```typescript
// Check external API for max values to match
// POST /api/external/scenarios uses .max(5000) on evaluatorContext
// Internal endpoint should match or document why it differs
export const generateScenarioSchema = z.object({
  evaluatorContext: z.string().max(5000),  // Match external API
});
```

#### 4. Review LLM Prompt File Paths

**Problem**: AI may reference prompt files that don't exist or load them incorrectly.

**Pattern**:
```typescript
// ✅ Correct: Use loadPrompt helper
const systemPrompt = loadPrompt('scenario-generator.txt');

// ✅ Verify file exists at prompts/scenario-generator.txt
// ✅ Content loaded as string, not path
```

#### 5. Check for Documented Patterns in Known Pitfalls

Before generating code, AI should search for relevant patterns in:
- CLAUDE.md "Known Pitfalls" (line 306-311)
- CLAUDE.md "Bug Prevention Patterns" (line 313-426)
- docs/solutions/prevention-strategies/bug-prevention-patterns.md

**Common gaps AI misses**:
- Auth headers (use authFetch, not raw fetch)
- Rate limiting on LLM endpoints (P2 for MVP)
- Async file I/O (use fs/promises, not fs sync)
- 204 No Content handling (check status before .json())
```

---

## Ralph prd.json Improvements

Current `prd.json` format can be enhanced to catch these patterns earlier.

### Recommended Additions to User Story Schema

Add new optional fields to each user story:

```json
{
  "id": "US-001",
  "title": "...",
  "acceptanceCriteria": [...],

  // NEW: Pattern validation
  "mustImportFrom": [
    {
      "file": "src/lib/validators.ts",
      "exports": ["ScenarioCategoryValues"],
      "reason": "Single source of truth for categories"
    }
  ],

  // NEW: Anti-patterns to avoid
  "antiPatterns": [
    {
      "pattern": "await fetch\\(",
      "message": "Use authFetch from useAuth hook",
      "severity": "error"
    },
    {
      "pattern": "z\\.array\\(z\\.string\\(\\)\\).*skill",
      "message": "Use SkillSchema enum for type-safe skills",
      "severity": "warning"
    }
  ],

  // NEW: Reference implementations
  "referenceFiles": [
    {
      "file": "src/app/api/scenarios/route.ts",
      "lines": "67-127",
      "purpose": "Auth + validation pattern"
    }
  ],

  // NEW: Validation checks
  "requiredChecks": [
    "All string fields have .max() limits",
    "LLM calls have timeout (10-30s)",
    "Uses loadPrompt() not raw file read"
  ]
}
```

### Example User Story with Enhanced Validation

```json
{
  "id": "US-GEN-001",
  "title": "Create scenario generation modal component",
  "description": "Build GenerateScenarioModal with complaint text input and AI-generated field editing",

  "acceptanceCriteria": [
    "Component extracted to src/components/generate-scenario-modal.tsx",
    "Uses authFetch from useAuth hook for API calls",
    "Form fields derived from GeneratedScenario type",
    "Category dropdown uses ScenarioCategoryValues from validators.ts",
    "Skills use SkillSchema enum from skills.ts"
  ],

  "mustImportFrom": [
    {
      "file": "src/lib/validators.ts",
      "exports": ["ScenarioCategoryValues", "GeneratedScenario"],
      "reason": "Single source of truth for categories and generated schema"
    },
    {
      "file": "src/lib/skills.ts",
      "exports": ["SkillSchema", "VALID_SKILLS"],
      "reason": "Type-safe skills validation"
    }
  ],

  "antiPatterns": [
    {
      "pattern": "const (VALID_CATEGORIES|CATEGORY_OPTIONS) = \\[",
      "message": "Import ScenarioCategoryValues instead of hardcoding",
      "severity": "error",
      "autoFix": "import { ScenarioCategoryValues } from '@/lib/validators';"
    },
    {
      "pattern": "fetch\\([^a]",
      "message": "Use authFetch from useAuth() hook",
      "severity": "error",
      "referenceFile": "src/components/counselor-dashboard.tsx",
      "referenceLines": "51-54"
    }
  ],

  "referenceFiles": [
    {
      "file": "src/components/bulk-import-modal.tsx",
      "purpose": "Modal component structure and state management pattern",
      "keyPatterns": ["useState for loading", "onSuccess callback", "error display"]
    },
    {
      "file": "src/components/supervisor-dashboard.tsx",
      "lines": "936-1247",
      "purpose": "Scenario form field structure"
    }
  ],

  "requiredChecks": [
    "npx tsc --noEmit passes",
    "npm run lint passes",
    "No hardcoded category/skill arrays (grep check)",
    "Uses authFetch not raw fetch (grep check)",
    "All imports resolve (no missing files)"
  ],

  "priority": 1,
  "estimatedLines": 120,
  "passes": false
}
```

### Ralph Pre-Flight Validation Script

Ralph could run this script **before** starting code generation:

```bash
#!/bin/bash
# scripts/ralph-pre-flight.sh
# Run before autonomous code generation to validate prd.json requirements

set -e

PRD_FILE="${1:-ralph/prd.json}"

echo "🔍 Ralph Pre-Flight Validation"
echo "================================"
echo ""

# Extract all mustImportFrom entries
echo "📦 Checking canonical sources exist..."
jq -r '.userStories[].mustImportFrom[]? | .file' "$PRD_FILE" | while read -r file; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing file: $file"
    exit 1
  else
    echo "✅ $file exists"
  fi
done

# Extract all referenceFiles and verify they exist
echo ""
echo "📚 Checking reference files exist..."
jq -r '.userStories[].referenceFiles[]? | .file' "$PRD_FILE" | while read -r file; do
  if [ ! -f "$file" ]; then
    echo "❌ Missing reference: $file"
    exit 1
  else
    echo "✅ $file exists"
  fi
done

# Check for anti-patterns in existing code (baseline)
echo ""
echo "🚫 Baseline anti-pattern check..."
ANTIPATTERN_COUNT=0
jq -r '.userStories[].antiPatterns[]? | @json' "$PRD_FILE" | while read -r pattern_json; do
  pattern=$(echo "$pattern_json" | jq -r '.pattern')
  message=$(echo "$pattern_json" | jq -r '.message')

  if grep -rE "$pattern" src/ --include="*.ts" --include="*.tsx" >/dev/null 2>&1; then
    echo "⚠️  Found anti-pattern: $message"
    ((ANTIPATTERN_COUNT++))
  fi
done

if [ $ANTIPATTERN_COUNT -gt 0 ]; then
  echo ""
  echo "⚠️  Warning: $ANTIPATTERN_COUNT anti-patterns found in existing code"
  echo "    (This is informational — not blocking)"
fi

echo ""
echo "✅ Pre-flight checks passed"
echo ""
echo "📋 Next: Review user stories and start implementation"
```

### Ralph Post-Generation Validation Script

```bash
#!/bin/bash
# scripts/ralph-post-flight.sh
# Run after code generation to validate against prd.json requirements

set -e

PRD_FILE="${1:-ralph/prd.json}"
STORY_ID="${2}"  # Optional: check specific story

echo "🔍 Ralph Post-Flight Validation"
echo "================================"
echo ""

# Type check
echo "📘 TypeScript type check..."
if npx tsc --noEmit --pretty false; then
  echo "✅ Type check passed"
else
  echo "❌ Type check failed"
  exit 1
fi

# Lint check
echo ""
echo "🧹 ESLint check..."
if npm run lint --silent; then
  echo "✅ Lint passed"
else
  echo "❌ Lint failed"
  exit 1
fi

# Anti-pattern detection
echo ""
echo "🚫 Anti-pattern detection..."
VIOLATIONS=0

jq -c '.userStories[] | select(.id == "'$STORY_ID'" or "'$STORY_ID'" == "") | .antiPatterns[]?' "$PRD_FILE" | while read -r pattern_json; do
  pattern=$(echo "$pattern_json" | jq -r '.pattern')
  message=$(echo "$pattern_json" | jq -r '.message')
  severity=$(echo "$pattern_json" | jq -r '.severity')

  if grep -rE "$pattern" src/ --include="*.ts" --include="*.tsx" | grep -v node_modules >/dev/null 2>&1; then
    if [ "$severity" = "error" ]; then
      echo "❌ VIOLATION: $message"
      ((VIOLATIONS++))
    else
      echo "⚠️  WARNING: $message"
    fi
    grep -rn "$pattern" src/ --include="*.ts" --include="*.tsx" | head -3
  fi
done

# Import verification
echo ""
echo "📦 Import verification..."
jq -c '.userStories[] | select(.id == "'$STORY_ID'" or "'$STORY_ID'" == "") | .mustImportFrom[]?' "$PRD_FILE" | while read -r import_json; do
  file=$(echo "$import_json" | jq -r '.file')
  exports=$(echo "$import_json" | jq -r '.exports[]')

  for export_name in $exports; do
    if ! grep -r "import.*$export_name.*from.*$file" src/ --include="*.ts" --include="*.tsx" >/dev/null 2>&1; then
      echo "⚠️  Missing import: $export_name from $file"
      echo "   (May be intentional if not used)"
    else
      echo "✅ Found import: $export_name from $file"
    fi
  done
done

echo ""
if [ $VIOLATIONS -gt 0 ]; then
  echo "❌ Post-flight failed: $VIOLATIONS critical violations"
  exit 1
else
  echo "✅ Post-flight checks passed"
fi
```

---

## Post-Review Compound Documentation Pattern

After **every** code review (whether Ralph-generated or manual), create a compound document:

### File: `docs/solutions/ai-generation/YYYY-MM-DD-feature-name-lessons.md`

**Template**:

```markdown
# Lessons: [Feature Name] ([Issue #])

**Generated**: YYYY-MM-DD
**Type**: AI Code Generation (Ralph / Claude / Manual)
**Review Findings**: X total (Y critical, Z medium, W minor)

---

## What AI Did Well

- [Pattern it followed correctly]
- [Good architectural decision]
- [Security consideration it got right]

---

## What AI Missed

### Pattern A: [Category]

**What happened**: [Description]

**Why**: [Root cause — was example unclear? Pattern not in CLAUDE.md?]

**Prevention**: [What to add to CLAUDE.md / prd.json / checklist]

**Example**:
```typescript
// ❌ AI generated this
const CATEGORIES = ['cohort_training', ...];

// ✅ Should have been this
import { ScenarioCategoryValues } from '@/lib/validators';
```

### Pattern B: [Category]

...

---

## CLAUDE.md Updates

[Paste exact text to add to CLAUDE.md]

---

## prd.json Schema Updates

[Suggest new fields or validation rules for future prd.json files]

---

## Pre-Flight Checks Added

[New checks to add to ralph-pre-flight.sh]

---

## References

- GitHub Issue: #XX
- PR: #YY
- Code Review: docs/reviews/YYYY-MM-DD-feature-name-review.md
```

---

## Integration with Ralph Workflow

Ralph should automatically run these checks at key milestones:

### 1. Before Starting (Ralph Pre-Flight)

```bash
npm run ralph:preflight -- ralph/prd.json
```

Validates:
- All reference files exist
- All canonical sources exist
- Baseline anti-pattern check (informational)

### 2. After Each User Story (Incremental Check)

```bash
npm run ralph:check-story -- US-001
```

Validates:
- Type check passes
- Lint passes
- No new anti-patterns for this story
- Required imports present

### 3. Before Marking Complete (Ralph Post-Flight)

```bash
npm run ralph:postflight
```

Validates:
- All user stories pass checks
- Full codebase type check
- Full anti-pattern scan
- Manual checklist items documented

---

## Measurement & Iteration

Track these metrics over time to measure improvement:

| Metric | Baseline (Issue #12) | Target (Next 3 Features) |
|--------|---------------------|--------------------------|
| Critical findings per feature | 2 | <1 |
| Medium findings per feature | 5 | <3 |
| Hardcoded constants detected | 4 | 0 |
| Auth pattern violations | 1 | 0 |
| Validation gaps | 3 | <1 |
| Pre-existing bugs found | 3 | N/A (good to find!) |
| Fix time (minutes) | ~60 | <30 |

**Success criteria**: 80% reduction in preventable issues within 3 autonomous sessions.

---

## Quick Reference Card (Print & Pin)

```
╔══════════════════════════════════════════════════════════════╗
║          AI CODE GENERATION QUICK CHECKLIST                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  BEFORE GENERATION                                           ║
║  ☐ Read CLAUDE.md Known Pitfalls (line 306)                 ║
║  ☐ Search for similar features (grep reference)             ║
║  ☐ Run ralph:preflight to validate prd.json                 ║
║                                                              ║
║  DURING GENERATION                                           ║
║  ☐ Import from canonical sources (validators.ts, skills.ts) ║
║  ☐ Use established patterns (authFetch, loadPrompt)         ║
║  ☐ Match validation rigor (check similar schemas)           ║
║  ☐ Reference docs, not file paths, for LLM prompts          ║
║                                                              ║
║  AFTER GENERATION                                            ║
║  ☐ npx tsc --noEmit (type check)                            ║
║  ☐ npm run lint (style check)                               ║
║  ☐ grep hardcoded constants                                 ║
║  ☐ grep raw fetch calls                                     ║
║  ☐ grep missing .max() on schemas                           ║
║  ☐ Run ralph:postflight for full validation                 ║
║                                                              ║
║  SOURCES OF TRUTH                                            ║
║  • Categories → validators.ts:ScenarioCategoryValues         ║
║  • Skills → skills.ts:SkillSchema                            ║
║  • Auth → useAuth() hook → authFetch                         ║
║  • Files → loadPrompt() / loadEvaluatorContext()             ║
║  • Validation → Check external API for .max() values         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Summary

**Before this document**: Code reviews found 16 issues across 4 pattern categories, requiring ~60 minutes of fixes.

**After implementing these strategies**:
- Ralph pre-flight catches missing references **before** generation
- Enhanced prd.json documents canonical sources and anti-patterns
- Post-flight validation automates 80% of pattern checking
- CLAUDE.md updates make conventions more discoverable
- Compound docs capture institutional knowledge

**Expected impact**: 80% reduction in preventable issues, faster reviews, shorter fix cycles.

---

## Next Actions

1. **Immediate** (before next Ralph session):
   - [ ] Add AI Code Generation Patterns section to CLAUDE.md (after line 426)
   - [ ] Create `scripts/ralph-preflight.sh` validation script
   - [ ] Create `scripts/ralph-postflight.sh` validation script

2. **Short-term** (this week):
   - [ ] Update ralph/prd.json with enhanced schema fields for next feature
   - [ ] Add ESLint rules for hardcoded categories/skills
   - [ ] Document evaluator context file path bug in compound doc

3. **Long-term** (next month):
   - [ ] Track metrics from next 3 autonomous sessions
   - [ ] Refine prd.json schema based on effectiveness
   - [ ] Build automated prd.json validator tool
   - [ ] Consider pre-commit hooks for anti-pattern detection

---

**Status**: Ready for implementation
**Owner**: Brad Pendergraft
**Review Date**: 2026-02-10
**Next Review**: After next Ralph autonomous session
