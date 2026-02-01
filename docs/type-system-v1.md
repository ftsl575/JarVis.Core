# Type System v1

## Purpose
Type system v1 provides a deterministic `device_type` classifier for item records. It maps each item to **one** device type using a simple, data-first ruleset with a consistent fallback.

## Input
Minimum required field:
- `description` (string)

Optional fields:
- `vendor` (string)
- `partNumber`/`pn` (string)

## Output
- `device_type`: one of the allowed types in `data/type-system/v1/types.json`, or the fallback `Unclear`.
- `matched_rule` (optional, debug): shows which rule matched (e.g., `pn:P19777-B21`, `kw:power supply`, or `fallback`).

## Dell applicability (vendor-gated)
For Dell, `device_type` applicability is **gated by the Dell Device_Type Gatekeeper** and does **not** apply to every row.
- The Gatekeeper determines **whether** a row is SYSTEM-level and therefore eligible for `device_type`.
- type-system-v1 runs **only after** a row is deterministically confirmed as SYSTEM-level.
- Non-system rows **MUST NOT** receive `device_type`; absence is the correct final state.
- `Unclear` is допустим **only** for SYSTEM rows when no deterministic classification exists; it is not a default and never appears on non-system rows.

## Matching Priority
1. **PN exact map** (if part number present)
2. **Keyword match** in `description` (case-insensitive)
3. **Fallback** to `Unclear`

Keyword rules are evaluated in the **order listed** in `data/type-system/v1/rules.json`. The first match wins.

## Data Sources
- Allowed types: `data/type-system/v1/types.json`
- Rules: `data/type-system/v1/rules.json`

## Normalization (v1)
- trim
- collapse multiple spaces
- lower-case comparison (keywords)

## Extending the Rules
To add or change behavior:
1. Update `data/type-system/v1/types.json` if introducing a new type.
2. Add PN entries or keyword rules to `data/type-system/v1/rules.json` in the desired priority order.
3. Add or update tests in `tests/type-system-v1.test.js`.

No architecture changes are required to extend the ruleset.
