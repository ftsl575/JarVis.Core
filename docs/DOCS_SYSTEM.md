# Documentation System (v1)

## Definitions
**Document Type**
- **NORMATIVE**: Authoritative rules/contracts. Required for any decision or implementation.
- **GUIDE**: Helpful how-to or explanatory content. Never overrides NORMATIVE.
- **RECORD**: Historical snapshots, prompts, or evidence of decisions. Never overrides NORMATIVE.
- **ARCHIVE**: Deprecated or superseded material kept for audit/history only. Never overrides NORMATIVE.

**Scope**
- **CORE**: Vendor-agnostic, applies to all brands.
- **DELL**: Dell-only rules and contracts.
- **HPE**: HPE-only rules and contracts.

## Conflict Priority (highest to lowest)
1) Brand Design Freeze (if exists)
2) Brand Gatekeeper / brand-only applicability rules
3) Brand semantic model / principles
4) Core contracts (canonical / type-system / segmentation)
5) Records/archives never override norms

## Single Source of Truth & Deprecation
- **Single source of truth**: One NORMATIVE rule per topic per scope. Do not create parallel competing norms.
- **Deprecation protocol**: Mark a NORMATIVE doc as deprecated, then move it to `docs/archive/` with an archive note.
- **Brand rule**: Add vendor-specific rules under `docs/RULES.<BRAND>/`. Do not copy CORE docs; CORE remains brand-agnostic.

## Minimal Inputs (Context Packs)
- **Consultant-window**: Read `docs/DOCS_SYSTEM.md` + relevant PACK file(s). Use RECORDS only when asked for history/evidence.
- **Project-window**: Attach PACK file(s) + any task-specific RECORDS.
