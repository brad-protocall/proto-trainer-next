#!/bin/bash
#
# Ralph - Autonomous Agent for Proto Trainer Next
# Executes user stories from ralph/prd.json sequentially
#
# Usage: ./ralph.sh [--dry-run] [--start-from US-XXX]
#
# Options:
#   --dry-run         Show what would be done without executing
#   --start-from      Start from a specific user story ID
#   --max-stories N   Maximum number of stories to process (default: all)
#
# Prerequisites:
#   - claude CLI installed and authenticated
#   - Node.js and npm installed
#   - Git configured with commit access
#

set -e  # Exit on error

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$PROJECT_DIR/ralph/prd.json"
PROGRESS_FILE="$PROJECT_DIR/ralph/progress.txt"
LOG_DIR="$PROJECT_DIR/logs/ralph"
BRANCH_NAME=$(jq -r '.branchName' "$PRD_FILE")

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
DRY_RUN=false
START_FROM=""
MAX_STORIES=999

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --start-from)
            START_FROM="$2"
            shift 2
            ;;
        --max-stories)
            MAX_STORIES="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Ensure prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"

    if ! command -v claude &> /dev/null; then
        echo -e "${RED}Error: claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code${NC}"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq not found. Install with: brew install jq${NC}"
        exit 1
    fi

    if [ ! -f "$PRD_FILE" ]; then
        echo -e "${RED}Error: PRD file not found at $PRD_FILE${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Prerequisites OK${NC}"
}

# Create or switch to feature branch
setup_branch() {
    echo -e "${BLUE}Setting up branch: $BRANCH_NAME${NC}"

    cd "$PROJECT_DIR"

    # Check if branch exists
    if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
        echo "Branch exists, switching to it..."
        git checkout "$BRANCH_NAME"
    else
        echo "Creating new branch from main..."
        git checkout main
        git pull origin main 2>/dev/null || true
        git checkout -b "$BRANCH_NAME"
    fi

    echo -e "${GREEN}✓ On branch: $BRANCH_NAME${NC}"
}

# Log progress
log_progress() {
    local story_id="$1"
    local status="$2"
    local message="$3"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$timestamp] $story_id: $status - $message" >> "$PROGRESS_FILE"

    # Also update prd.json if story passed
    if [ "$status" = "PASSED" ]; then
        local tmp=$(mktemp)
        jq --arg id "$story_id" '
            .userStories = [.userStories[] | if .id == $id then .passes = true else . end]
        ' "$PRD_FILE" > "$tmp" && mv "$tmp" "$PRD_FILE"
    fi
}

# Execute a single user story
execute_story() {
    local story_id="$1"
    local story_title="$2"
    local story_desc="$3"
    local criteria="$4"
    local story_notes="$5"

    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Starting: $story_id - $story_title${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"

    # Create log file for this story
    mkdir -p "$LOG_DIR"
    local log_file="$LOG_DIR/${story_id}-$(date '+%Y%m%d-%H%M%S').log"

    # Build the prompt for Claude
    local prompt="You are executing user story $story_id for the Proto Trainer Next pre-handoff cleanup.

## Story Details
**ID:** $story_id
**Title:** $story_title
**Description:** $story_desc

## Acceptance Criteria
$criteria

## Notes
$story_notes

## Instructions
1. Read the relevant files mentioned in the acceptance criteria
2. Make the required changes
3. Run \`npx tsc --noEmit\` to verify no type errors
4. Run \`npm run lint\` if specified in criteria
5. If all criteria pass, commit with the message specified in criteria
6. Report success or failure with details

IMPORTANT:
- Auto-commit when all acceptance criteria pass
- If you encounter errors, fix them before committing
- Do not modify tests to make them pass - fix the implementation
- Be precise and minimal in your changes"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${YELLOW}[DRY RUN] Would execute:${NC}"
        echo "$prompt" | head -20
        echo "..."
        return 0
    fi

    log_progress "$story_id" "STARTED" "$story_title"

    # Execute with Claude CLI
    echo "$prompt" | claude --dangerously-skip-permissions -p 2>&1 | tee "$log_file"
    local exit_code=${PIPESTATUS[1]}

    # Check if story passed (look for commit in git log)
    local latest_commit=$(git log -1 --oneline 2>/dev/null || echo "")

    if echo "$latest_commit" | grep -qi "$story_id\|$(echo "$story_title" | cut -c1-20)"; then
        echo -e "${GREEN}✓ $story_id PASSED${NC}"
        log_progress "$story_id" "PASSED" "Committed: $latest_commit"
        return 0
    elif [ $exit_code -eq 0 ]; then
        # Claude exited OK but may not have committed - check typecheck
        if npx tsc --noEmit 2>/dev/null; then
            echo -e "${YELLOW}⚠ $story_id completed but may not have committed${NC}"
            log_progress "$story_id" "REVIEW" "Typecheck passes, review needed"
            return 0
        else
            echo -e "${RED}✗ $story_id FAILED - typecheck errors${NC}"
            log_progress "$story_id" "FAILED" "Typecheck errors remain"
            return 1
        fi
    else
        echo -e "${RED}✗ $story_id FAILED - Claude exited with error${NC}"
        log_progress "$story_id" "FAILED" "Claude exit code: $exit_code"
        return 1
    fi
}

# Main execution loop
main() {
    echo -e "${GREEN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                    RALPH AUTONOMOUS AGENT                      ║"
    echo "║              Proto Trainer Next - Pre-Handoff Cleanup          ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    check_prerequisites

    if [ "$DRY_RUN" = false ]; then
        setup_branch
    fi

    # Read stories from prd.json
    local total_stories=$(jq '.userStories | length' "$PRD_FILE")
    local project_name=$(jq -r '.project' "$PRD_FILE")
    local description=$(jq -r '.description' "$PRD_FILE")

    echo ""
    echo -e "${BLUE}Project: $project_name${NC}"
    echo -e "${BLUE}Description: $description${NC}"
    echo -e "${BLUE}Total Stories: $total_stories${NC}"
    echo ""

    # Mark start in progress file
    if [ "$DRY_RUN" = false ]; then
        echo "" >> "$PROGRESS_FILE"
        echo "# Run started: $(date '+%Y-%m-%d %H:%M:%S')" >> "$PROGRESS_FILE"
        echo "# Branch: $BRANCH_NAME" >> "$PROGRESS_FILE"
        echo "" >> "$PROGRESS_FILE"
    fi

    local stories_processed=0
    local stories_passed=0
    local stories_failed=0
    local skip_until_found=true

    if [ -z "$START_FROM" ]; then
        skip_until_found=false
    fi

    # Process each story in priority order
    for row in $(jq -r '.userStories | sort_by(.priority) | .[] | @base64' "$PRD_FILE"); do
        _jq() {
            echo "${row}" | base64 --decode | jq -r "$1"
        }

        local story_id=$(_jq '.id')
        local story_title=$(_jq '.title')
        local story_desc=$(_jq '.description')
        local story_notes=$(_jq '.notes')
        local already_passed=$(_jq '.passes')
        local criteria=$(echo "${row}" | base64 --decode | jq -r '.acceptanceCriteria | map("- " + .) | join("\n")')

        # Skip already passed stories
        if [ "$already_passed" = "true" ]; then
            echo -e "${GREEN}⏭ Skipping $story_id (already passed)${NC}"
            continue
        fi

        # Handle --start-from
        if [ "$skip_until_found" = true ]; then
            if [ "$story_id" = "$START_FROM" ]; then
                skip_until_found=false
            else
                echo -e "${YELLOW}⏭ Skipping $story_id (before start point)${NC}"
                continue
            fi
        fi

        # Check max stories limit
        if [ $stories_processed -ge $MAX_STORIES ]; then
            echo -e "${YELLOW}Reached max stories limit ($MAX_STORIES)${NC}"
            break
        fi

        # Execute the story
        if execute_story "$story_id" "$story_title" "$story_desc" "$criteria" "$story_notes"; then
            ((stories_passed++))
        else
            ((stories_failed++))
            # Continue to next story even on failure (aggressive mode)
        fi

        ((stories_processed++))

        # Brief pause between stories
        sleep 2
    done

    # Summary
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}                         SUMMARY                                ${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "Stories Processed: $stories_processed"
    echo -e "${GREEN}Passed: $stories_passed${NC}"
    echo -e "${RED}Failed: $stories_failed${NC}"
    echo ""

    if [ $stories_failed -eq 0 ] && [ $stories_processed -gt 0 ]; then
        echo -e "${GREEN}🎉 All stories passed! Ready for review.${NC}"
        echo ""
        echo "Next steps:"
        echo "  1. Review changes: git diff main...$BRANCH_NAME"
        echo "  2. Push branch: git push -u origin $BRANCH_NAME"
        echo "  3. Create PR: gh pr create"
    elif [ $stories_failed -gt 0 ]; then
        echo -e "${YELLOW}⚠ Some stories failed. Check logs in $LOG_DIR${NC}"
        echo ""
        echo "To resume from a specific story:"
        echo "  ./ralph.sh --start-from US-XXX"
    fi

    # Final log entry
    if [ "$DRY_RUN" = false ]; then
        echo "" >> "$PROGRESS_FILE"
        echo "# Run completed: $(date '+%Y-%m-%d %H:%M:%S')" >> "$PROGRESS_FILE"
        echo "# Processed: $stories_processed, Passed: $stories_passed, Failed: $stories_failed" >> "$PROGRESS_FILE"
    fi
}

# Run main
main
