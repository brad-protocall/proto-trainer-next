# Supervisor Dashboard Decomposition

**Date**: 2026-02-12
**Applies to**: proto-trainer-next (completed), Proto Training Guide legacy (recommendation)
**Status**: Completed in proto-trainer-next. Flagged for PTG legacy evaluation.

---

## What We Did (proto-trainer-next)

Split `supervisor-dashboard.tsx` (1,616 lines, 31 `useState` hooks) into 3 focused files:

| File | Lines | Responsibility |
|------|------:|----------------|
| `supervisor-dashboard.tsx` | 277 | Tab routing, user init, shared data, flags tab |
| `supervisor/scenario-tab.tsx` | 833 | Scenario list, form modal, bulk import, generate |
| `supervisor/assignment-tab.tsx` | 588 | Assignment list, bulk assignment form modal |

No behavior change. All tabs render identically before and after.

## Why We Did It

1. **Navigation**: Finding the assignment bulk-create handler meant scrolling past 500+ lines of scenario code. Now it's at the top of its own file.
2. **Stale state bugs**: The old `globalScenariosCache` synced via a `useEffect` watching the scenarios tab's data. If you created a scenario and switched tabs before the effect ran, assignments saw stale data. Now the parent loads global scenarios independently.
3. **Error bleed**: A scenario save error stayed visible after switching to the assignments tab. Now each tab manages its own error state.
4. **Merge conflicts**: Any change to scenarios or assignments touched the same file. Parallel work required manual conflict resolution on unrelated code.

## What We Fixed Along the Way

| Issue | Before | After |
|-------|--------|-------|
| `getCounselorName` typed as `any` | `(c: any) => c.displayName \|\| c.display_name \|\| ...` | `getUserDisplayName(user: User)` in `src/lib/format.ts` |
| `bulkResult` inline type | 8-line anonymous type literal | Uses existing `BulkAssignmentResponse` from `src/types/index.ts` |
| `authFetch` function type | Inferred, not exportable | `AuthFetchFn` exported from `src/lib/fetch.ts` |
| `globalScenariosCache` stale sync | `useEffect` syncing from scenario tab state | Parent fetches independently, passes down |

## Decision Framework: Does PTG Legacy Need This?

### Current State of PTG Legacy

`SupervisorDashboard.jsx` is **1,718 lines** with the same structure: scenarios tab + assignments tab + accounts tab + flags tab, all in one file with inline form modals.

### When to Decompose

Decompose if **two or more** of these are true:

- [ ] Multiple developers work on the supervisor dashboard concurrently
- [ ] Bug fixes in one tab frequently cause regressions in another tab
- [ ] You're adding a new tab or major feature to the dashboard
- [ ] State from one tab leaks into another (stale errors, stale data)
- [ ] You regularly struggle to find the right handler in the file

### When NOT to Decompose

Skip it if:

- The PTG legacy app is being sunset in favor of proto-trainer-next
- No active feature work is planned for the supervisor dashboard
- The team is small enough that one person owns the whole file
- You're planning a full rewrite rather than incremental changes

### Effort Estimate

Based on the proto-trainer-next decomposition:

| Step | Time |
|------|------|
| Plan + review prop interfaces | 30 min |
| Extract scenario tab | 45 min |
| Extract assignment tab | 45 min |
| Refactor parent + wire props | 30 min |
| Type-check / lint / test | 15 min |
| **Total** | **~3 hours** |

PTG legacy uses JSX (no TypeScript), so the type-safety fixes don't apply, but the structural work is the same.

### If You Decide to Decompose PTG Legacy

Follow the same pattern:

1. **Parent keeps**: Tab routing, user init, shared reference data (counselors, accounts, scenarios list for dropdowns), any tab that's < 100 lines of JSX.
2. **Each tab gets**: Its own file, its own loading state, its own error state, its own data-fetching.
3. **Parent provides**: `authFetch` (or equivalent), counselor/account lists, a callback for when data changes (so sibling tabs can reload).
4. **No barrel files**: Direct imports from `supervisor/scenario-tab.jsx`. Keep it simple.
5. **Modals stay with their tab**: The scenario form modal goes with the scenario tab, not into a separate file. Co-location > abstraction.

### File structure for PTG legacy (if applied)

```
src/components/
  SupervisorDashboard.jsx              (~200 lines, parent)
  supervisor/
    ScenarioTab.jsx                    (~600 lines)
    AssignmentTab.jsx                  (~500 lines)
    AccountTab.jsx                     (~200 lines)
```

`SupervisorFlagsTab.jsx` already exists as a separate component in PTG legacy (202 lines) - no work needed there.

## Commit Reference

proto-trainer-next commit: `fe7016d` on `main`
