DOC_TYPE: NORMATIVE
DOC_SCOPE: CORE
DOC_STATUS: ACTIVE
DOC_ROLE: Consultant-window, Project-window, Codex-context

# Segmentation

## Problem statement

Adjacent CTO anchors can appear back-to-back without component rows between them. This causes the current diagnostics segmentation to over-split configurations by treating every anchor as a new configuration, even when multiple anchors are part of the same configuration. As a result, downstream artifacts may look incorrect even though upstream generators remain correct.

## Segmentation Target Model (formal rules)

- Configurations are created **only** by primary CTO anchors.
- Secondary CTO anchors do **not** create configurations.
- Placement markers (B##) and Factory Integrated are metadata.
- Number of configurations equals the number of primary anchors.
- Components belong to the currently active configuration.
- Lines outside configurations may exist (e.g., ZIP / spare list sections).

## Terms and definitions

- **Spec / row**: A single line item in the cleaned spec input.
- **Configuration**: A contiguous segment of component rows associated with a primary CTO anchor.
- **CTO anchor**: A row that identifies a CTO configuration boundary context.
- **Primary anchor**: The first CTO anchor in a run of adjacent CTO anchors; it starts a configuration.
- **Secondary anchor**: Any subsequent CTO anchor in a run of adjacent CTO anchors; it does not start a configuration.
- **Adjacent CTO anchors**: Consecutive CTO anchor rows with no component rows between them.
- **Placement (B##)**: A placement marker line (e.g., B12) that provides metadata for the current configuration.
- **Factory Integrated**: A line indicating factory integration; treated as metadata for the current configuration.

## Adjacent CTO anchors — priority rule

If multiple CTO anchors appear consecutively with **no** component rows between them:

- The **first** anchor is **primary**.
- All subsequent anchors are **secondary**.
- **Secondary** anchors do **not** create new configurations.

## Invariants

- `#configs == #primary anchors`.
- Secondary anchors never start a configuration.
- Placement / Factory Integrated are metadata only.
- Components attach to the active configuration.
- Out-of-config sections are allowed.

## Logical examples (conceptual, no XLSX)

- **Primary + secondary → 1 configuration**
- **Primary + components + primary → 2 configurations**

## Implementation note / guardrail

Current diagnostics segmentation may deviate from this model. Any future implementation PR affecting segmentation must not introduce new concepts, rules, heuristics, or exceptions unless they are first documented in `docs/core/SEGMENTATION.md` via a docs-only PR.
