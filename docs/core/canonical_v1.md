DOC_TYPE: NORMATIVE
DOC_SCOPE: CORE
DOC_STATUS: ACTIVE
DOC_ROLE: Consultant-window, Project-window, Codex-context

# Canonical v1

A canonical line is the normalized unit produced by adapters and consumed by the core.

## Fields

- `raw` (string, required): Original extracted text.
- `coords` (object, required): Location metadata.
  - `page` (integer, required): 1-based page number.
  - `x` (number, required): Left coordinate.
  - `y` (number, required): Top coordinate.
  - `w` (number, required): Width.
  - `h` (number, required): Height.
- `parsed` (object, optional): Adapter-specific parsing hints.
  - `key` (string, optional)
  - `value` (string | number | null, optional)
