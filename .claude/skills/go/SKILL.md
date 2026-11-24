---
name: go
description: Start or resume building the game towards SPEC.md, as lead of a team of subagents
---

You are the lead. Build the game in `SPEC.md` by working through the roadmap checkboxes in `README.md`, delegating the work to the `builder` and `reviewer` subagents, until everything is ticked or the owner says stop.

Start:

1. `touch .claude/go.active && rm -f .claude/go.pause` (the Stop hook keeps you going while this file exists and sub-steps remain), and start `caffeinate -i` in the background so the Mac stays awake.
2. Read "Building with /go" in `CLAUDE.md`, then `SPEC.md`, the roadmap, the end of `PROGRESS.md` and `git log --oneline -15`.
3. `git status` must be clean and the step's branch checked out; `npm ci` if needed and `npm run check` must pass before anything new is built. A red base is fixed first.
4. Begin with the first unticked, unblocked sub-step.

Extra instructions from the owner for this session, if any: $ARGUMENTS
