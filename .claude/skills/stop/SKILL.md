---
name: stop
description: Wrap up the /go session cleanly and report
---

Stop building. `rm -f .claude/go.active .claude/go.pause` first, so the Stop hook lets you finish. Then follow "When the owner says stop" in the section "Building with /go" in `CLAUDE.md`: let a subagent that is nearly done finish, stop the others, leave the tree clean and pushed, stop `caffeinate`, write the session's entry in `PROGRESS.md`, and give the summary. $ARGUMENTS
