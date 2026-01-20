#!/bin/bash
#
# overnight-loop.sh - Ralph-style overnight automation for Claude Code
#
# Usage: ./scripts/overnight-loop.sh [max_issues]
#
# Finds GitHub Issues labeled "auto:ready", executes them with Claude Code,
# and creates PRs. Sends email summary when complete.
#
# Labels:
#   auto:ready       - Issue is approved and ready for processing
#   auto:in-progress - Currently being worked on
#   auto:completed   - PR created successfully
#   auto:failed      - Failed after max retries
#

set -euo pipefail

# Configuration
MAX_ISSUES="${1:-50}"
MAX_RETRIES=3
RETRY_WAIT=30
EMAIL_TO="brad.pendergraft@protocallservices.com"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATE=$(date +%Y-%m-%d)
TIME_START=$(date +%H:%M:%S)

# Logging
LOG_DIR="$PROJECT_DIR/logs"
LOG_SUMMARY="$LOG_DIR/overnight-$DATE.log"
LOG_DETAIL_DIR="$LOG_DIR/overnight-$DATE"
mkdir -p "$LOG_DETAIL_DIR"

# Counters
TOTAL_PROCESSED=0
TOTAL_SUCCESS=0
TOTAL_FAILED=0
ISSUES_PROCESSED=()

#######################################
# Log to both console and summary file
#######################################
log() {
    local msg="[$(date +%H:%M:%S)] $1"
    echo "$msg"
    echo "$msg" >> "$LOG_SUMMARY"
}

#######################################
# Log error
#######################################
log_error() {
    log "ERROR: $1"
}

#######################################
# Send email notification
#######################################
send_email() {
    local subject="$1"
    local body="$2"

    log "Sending email notification to $EMAIL_TO..."

    # Try mail command (works on macOS if mail is configured)
    if command -v mail &> /dev/null; then
        echo "$body" | mail -s "$subject" "$EMAIL_TO" 2>/dev/null && {
            log "Email sent via mail command"
            return 0
        }
    fi

    # Fallback: macOS notification
    if command -v osascript &> /dev/null; then
        osascript -e "display notification \"$subject\" with title \"Overnight Loop Complete\"" 2>/dev/null || true
        log "macOS notification sent (email may not have been delivered)"
    fi

    # Always log that we attempted
    log "Email notification attempted. Check $LOG_SUMMARY for full results."
}

#######################################
# Get issues labeled auto:ready
#######################################
get_ready_issues() {
    gh issue list \
        --label "auto:ready" \
        --state open \
        --limit "$MAX_ISSUES" \
        --json number,title,body \
        --jq 'sort_by(.number) | .[] | @base64'
}

#######################################
# Update issue labels
#######################################
update_labels() {
    local issue_number="$1"
    local remove_label="$2"
    local add_label="$3"

    if [ -n "$remove_label" ]; then
        gh issue edit "$issue_number" --remove-label "$remove_label" 2>/dev/null || true
    fi

    if [ -n "$add_label" ]; then
        gh issue edit "$issue_number" --add-label "$add_label"
    fi
}

#######################################
# Add comment to issue
#######################################
add_comment() {
    local issue_number="$1"
    local comment="$2"

    gh issue comment "$issue_number" --body "$comment" || {
        log "  Warning: Failed to add comment to issue #$issue_number (non-fatal)"
        return 0
    }
}

#######################################
# Run Claude Code with retries
#######################################
run_claude() {
    local issue_number="$1"
    local issue_body="$2"
    local issue_log="$LOG_DETAIL_DIR/issue-$issue_number.log"
    local attempt=1

    while [ $attempt -le $MAX_RETRIES ]; do
        log "  Attempt $attempt/$MAX_RETRIES..."

        # Build the prompt
        local prompt="Execute the following plan from GitHub Issue #$issue_number.

IMPORTANT INSTRUCTIONS:
1. Work through each step in order
2. Run validation after each step
3. If a step fails, retry up to 3 times before moving on
4. Commit your work after completing each phase
5. When all phases are complete, create a PR

PLAN:
$issue_body"

        # Run Claude Code
        if claude -p "$prompt" \
            --dangerously-skip-permissions \
            --verbose \
            --output-format stream-json \
            --max-turns 100 \
            >> "$issue_log" 2>&1; then
            return 0
        fi

        log "  Attempt $attempt failed"

        if [ $attempt -lt $MAX_RETRIES ]; then
            log "  Waiting ${RETRY_WAIT}s before retry..."
            sleep $RETRY_WAIT
        fi

        ((attempt++))
    done

    return 1
}

#######################################
# Process a single issue
#######################################
process_issue() {
    local issue_json="$1"
    local issue_number=$(echo "$issue_json" | base64 --decode | jq -r '.number')
    local issue_title=$(echo "$issue_json" | base64 --decode | jq -r '.title')
    local issue_body=$(echo "$issue_json" | base64 --decode | jq -r '.body')
    local issue_log="$LOG_DETAIL_DIR/issue-$issue_number.log"
    local branch_name="auto/issue-$issue_number"

    log ""
    log "Processing Issue #$issue_number: $issue_title"
    log "  Log: $issue_log"

    # Mark as in-progress
    update_labels "$issue_number" "auto:ready" "auto:in-progress"

    # Create and checkout branch
    log "  Creating branch: $branch_name"
    git checkout -B "$branch_name" main >> "$issue_log" 2>&1 || {
        log_error "Failed to create branch"
        update_labels "$issue_number" "auto:in-progress" "auto:failed"
        add_comment "$issue_number" "Failed to create branch. See logs for details."
        return 1
    }

    # Run Claude Code
    log "  Running Claude Code..."
    if run_claude "$issue_number" "$issue_body"; then
        log "  Claude Code completed successfully"

        # Check if there are changes to commit
        if git diff --quiet && git diff --cached --quiet; then
            log "  No changes made - marking as completed anyway"
            update_labels "$issue_number" "auto:in-progress" "auto:completed"
            add_comment "$issue_number" "Overnight automation completed. No code changes were needed."
            ISSUES_PROCESSED+=("$issue_number:success:no-changes")
            ((TOTAL_SUCCESS++))
        else
            # Create PR
            log "  Creating PR..."
            local pr_url=$(gh pr create \
                --title "Auto: $issue_title" \
                --body "Automated implementation for #$issue_number

## Summary
This PR was created by overnight automation.

## Issue
Closes #$issue_number

## Logs
See \`logs/overnight-$DATE/issue-$issue_number.log\` for execution details.

---
Generated by overnight-loop.sh" \
                --base main \
                --head "$branch_name" 2>&1) || {
                log_error "Failed to create PR"
                update_labels "$issue_number" "auto:in-progress" "auto:failed"
                add_comment "$issue_number" "Claude Code completed but PR creation failed. Branch: $branch_name"
                ISSUES_PROCESSED+=("$issue_number:failed:pr-creation")
                ((TOTAL_FAILED++))
                return 1
            }

            log "  PR created: $pr_url"
            update_labels "$issue_number" "auto:in-progress" "auto:completed"
            add_comment "$issue_number" "Overnight automation completed successfully.

PR: $pr_url"
            ISSUES_PROCESSED+=("$issue_number:success:$pr_url")
            ((TOTAL_SUCCESS++))
        fi
    else
        log_error "Claude Code failed after $MAX_RETRIES attempts"
        update_labels "$issue_number" "auto:in-progress" "auto:failed"
        add_comment "$issue_number" "Overnight automation failed after $MAX_RETRIES attempts.

See \`logs/overnight-$DATE/issue-$issue_number.log\` for details."
        ISSUES_PROCESSED+=("$issue_number:failed:claude-error")
        ((TOTAL_FAILED++))
    fi

    # Return to main branch
    git checkout main >> "$issue_log" 2>&1 || true

    ((TOTAL_PROCESSED++))
}

#######################################
# Generate summary report
#######################################
generate_summary() {
    local time_end=$(date +%H:%M:%S)

    cat << EOF

========================================
OVERNIGHT AUTOMATION SUMMARY
========================================
Date: $DATE
Started: $TIME_START
Finished: $time_end
Project: $PROJECT_DIR

Issues Processed: $TOTAL_PROCESSED
  Successful: $TOTAL_SUCCESS
  Failed: $TOTAL_FAILED

Details:
EOF

    for item in "${ISSUES_PROCESSED[@]}"; do
        local num=$(echo "$item" | cut -d: -f1)
        local status=$(echo "$item" | cut -d: -f2)
        local detail=$(echo "$item" | cut -d: -f3-)
        echo "  - Issue #$num: $status ($detail)"
    done

    cat << EOF

Logs: $LOG_DETAIL_DIR/
========================================
EOF
}

#######################################
# Main
#######################################
main() {
    log "========================================"
    log "OVERNIGHT AUTOMATION STARTED"
    log "========================================"
    log "Project: $PROJECT_DIR"
    log "Max issues: $MAX_ISSUES"
    log "Max retries per issue: $MAX_RETRIES"
    log ""

    # Change to project directory
    cd "$PROJECT_DIR"

    # Ensure we're on main and up to date
    log "Syncing with remote..."
    git checkout main >> "$LOG_SUMMARY" 2>&1 || true
    git pull >> "$LOG_SUMMARY" 2>&1 || true

    # Get ready issues
    log "Finding issues labeled 'auto:ready'..."
    local issues=$(get_ready_issues)

    if [ -z "$issues" ]; then
        log "No issues found with label 'auto:ready'"
        log "Nothing to do. Exiting."

        send_email \
            "Overnight Automation: No Issues" \
            "No issues were labeled 'auto:ready'. Nothing was processed."

        exit 0
    fi

    # Count issues
    local issue_count=$(echo "$issues" | wc -l | tr -d ' ')
    log "Found $issue_count issue(s) to process"

    # Process each issue
    while IFS= read -r issue_json; do
        [ -z "$issue_json" ] && continue
        process_issue "$issue_json" || true
    done <<< "$issues"

    # Generate and log summary
    local summary=$(generate_summary)
    echo "$summary"
    echo "$summary" >> "$LOG_SUMMARY"

    # Send email
    send_email \
        "Overnight Automation Complete: $TOTAL_SUCCESS/$TOTAL_PROCESSED succeeded" \
        "$summary"

    log ""
    log "Done. Full summary in: $LOG_SUMMARY"
}

# Run main
main "$@"
