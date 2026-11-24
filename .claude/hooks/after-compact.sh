#!/bin/bash
# SessionStart (compact) hook: after the context is summarised, remind the lead where it is.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
[ -f .claude/go.active ] || exit 0
echo "The context was just summarised. You are the lead of the /go build: follow 'Building with /go' in CLAUDE.md. Current branch: $(git branch --show-current). Uncommitted files: $(git status --short | wc -l | tr -d ' '). End of PROGRESS.md:"
tail -n 40 PROGRESS.md
