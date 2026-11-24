#!/bin/bash
# Stop hook: while /go is active and sub-steps remain, send the lead back to work.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0
[ -f .claude/go.active ] || exit 0
if [ -f .claude/go.pause ] && [ -n "$(find .claude/go.pause -mmin -45)" ]; then exit 0; fi
left=$(awk '
  /^[[:space:]]+- \[ \]/ { if (pending) n++; pending = 1; next }
  /^[[:space:]]+- blocked:/ { pending = 0; next }
  { if (pending) n++; pending = 0 }
  END { if (pending) n++; print n + 0 }
' README.md)
[ "$left" -gt 0 ] || exit 0
echo "/go is active and $left roadmap sub-steps are unticked. Carry on with the next one (CLAUDE.md, Building with /go). If you are waiting for a background subagent, or the owner is talking with you and wants you to hold, run 'touch .claude/go.pause' and stop again; remove it when you resume. If the owner said stop, follow the stop skill." >&2
exit 2
