# Dell diagnostics — batch runner (HPE-like behavior)

You are the Project-window for JarVis.Core.
Your task is to prepare a FINAL Codex implementation prompt for ONE small, safe PR.

You do NOT write code yourself.
You ONLY formulate strict Codex instructions.

--------------------------------------------------------------------
PROJECT
--------------------------------------------------------------------
Repository:
https://github.com/ftsl575/JarVis.Core

--------------------------------------------------------------------
AUTHORITATIVE CONTEXT (LOCKED)
--------------------------------------------------------------------
- HPE baseline v1 is STABLE and FROZEN.
- Dell Design Freeze v1 is authoritative:
  docs/DELL_DESIGN_FREEZE_v1.md
- Dell Stage 1 — CLOSED.
- Dell Stage 2 — CLOSED.
- Dell Stage 3 — CLOSED.
- Dell Stage 4 / cleaned_spec — CLOSED.
- Unit tests on main: GREEN.

--------------------------------------------------------------------
GOAL (SINGLE, STRICT)
--------------------------------------------------------------------
Add a Dell-only diagnostics batch runner that behaves
analogously to existing HPE batch scripts.

The runner MUST process all Dell inputs from:
  diag/_batch_inputs/*.xlsx

And for EACH input:
- produce final Excel artifacts (cleaned_spec at minimum),
- place artifacts physically under diag (per-input folder),
- keep out/ as the “last run” working directory.

--------------------------------------------------------------------
IN SCOPE (ALLOWED)
--------------------------------------------------------------------
- New Dell-only diagnostics batch script.
- Wiring existing Dell Stage 1–4 scripts in correct order.
- Copying final Excel artifacts from out/ to diag/<input_name>/.

--------------------------------------------------------------------
OUT OF SCOPE (FORBIDDEN)
--------------------------------------------------------------------
- Any HPE code, scripts, or tests.
- Any changes to Dell Stage 1–4 logic.
- Any refactors of existing pipelines.
- Any heuristics, guessing, or ML.
- Any binary artifacts.

--------------------------------------------------------------------
MANDATORY BEHAVIOR (MUST MATCH HPE MODEL)
--------------------------------------------------------------------
The Dell batch runner MUST:

1) Enumerate inputs from:
   diag/_batch_inputs/*.xlsx

2) For EACH input file:
   a) Clean out/ directory (out = last run only).
   b) Run Dell Stage 1 adapter.
   c) Run Dell Stage 2 segmentation.
   d) Run Dell Stage 3 materialization.
   e) Run Dell Stage 4 cleaned_spec consumer.
   f) Copy ALL produced *.xlsx artifacts from out/
      into a per-input folder under diag.

3) Create per-input folder under diag using input basename.

4) Be deterministic and sequential (no parallelism).

--------------------------------------------------------------------
IMPLEMENTATION NOTES (STRICT)
--------------------------------------------------------------------
- Reuse existing Dell scripts; do NOT reimplement logic.
- Follow patterns from:
  scripts/diagnostics/hpe-batch.js
  scripts/diagnostics/hpe-batch-pack.js
- Errors for one input MUST NOT prevent processing of others
  (follow HPE permissive batch behavior).
- Logging should clearly indicate per-input progress.

--------------------------------------------------------------------
FILES (MUST BE LISTED EXPLICITLY)
--------------------------------------------------------------------
Codex MUST list ALL files added or modified in this PR.

Expected new file (example name, Project-window may adjust):
- scripts/diagnostics/dell-batch.js

--------------------------------------------------------------------
ACCEPTANCE CRITERIA (ALL REQUIRED)
--------------------------------------------------------------------
- Running the Dell batch script processes ALL files
  in diag/_batch_inputs.
- For each input, cleaned_spec Excel appears physically
  under diag/<input_name>/.
- out/ contains only artifacts from the LAST processed input.
- Existing tests remain GREEN.
