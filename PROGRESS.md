# Progress

The lead's journal: one entry per finished sub-step, newest last. What was built, how it was checked, decisions, anything the owner should look at. The README checkboxes say what is done; this says how it went.

## 2026-11-24: setup

- Step 12 merged. `SPEC.md`, the roadmap as task queue (steps 13 to 20), CI on pull requests, `/go` and `/stop` skills, `builder` and `reviewer` subagents, keep-going and after-summary hooks added.
- GitHub Pages is enabled with GitHub Actions as its source; nothing is deployed until step 13's deploy sub-step.
- Supabase project exists; `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN` (expires about 2027-02-22 if the 90 days were kept) and `SUPABASE_DB_PASSWORD` are GitHub Actions secrets. Anonymous sign-ins are on.
- Next: step 13, "Test runner".
