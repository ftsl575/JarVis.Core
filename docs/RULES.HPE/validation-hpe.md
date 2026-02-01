DOC_TYPE: NORMATIVE
DOC_SCOPE: HPE
DOC_STATUS: ACTIVE
DOC_ROLE: Consultant-window, Project-window, Codex-context

# HPE Vendor Validation (v2)

This module adds HPE-specific validation checks on top of Canonical v1 outputs. The
results are aggregated into `summary.validation.hpe` without changing the Canonical
schema.

## Output shape

```json
{
  "validation": {
    "hpe": {
      "vendor": "HPE",
      "counts": { "error": 0, "warn": 0, "info": 0 },
      "codes": {
        "HPE.RULE.001": { "severity": "warn", "count": 2 }
      },
      "findingsSample": [
        {
          "code": "HPE.RULE.001",
          "severity": "warn",
          "message": "...",
          "itemRef": "..."
        }
      ],
      "topIssues": [
        { "code": "HPE.RULE.001", "severity": "warn", "count": 2 }
      ]
    }
  }
}
```

## Validation lifecycle

HPE validation uses a vendor lifecycle with three phases:

- **pre**: build shared indexes (ex: part-number groupings).
- **validateItem**: per-line rules that emit findings for a single item.
- **post**: cross-item checks (duplicates, consistency, coverage).

## Rule codes

| Code | Severity | Description |
| --- | --- | --- |
| `HPE.RULE.001` | warn | Line type sanity: emits only when confidence is low after scoring PN validity, quantity shape, and description signals. Includes `context.confidence`. |
| `HPE.RULE.002` | warn | Option kit vs spare mismatch: both signals appear in the same line item. |
| `HPE.RULE.003` | warn/error | Quantity validation: missing quantity (warn) or invalid numeric value (error). |
| `HPE.RULE.004` | warn/info | Part number format anomalies (warn) or normalized tokenized part numbers (info). |
| `HPE.RULE.005` | info | Duplicate part numbers with conflicting descriptions. |
| `HPE.RULE.006` | info | Same part number appears with different quantities. |
| `HPE.RULE.007` | warn | Same part number appears as option vs spare/factory line types. |

## RULE.001 confidence scoring

`HPE.RULE.001` only emits when the line is an HPE item with quantity and product number, is not a header/subtotal/service/warranty-only line, is not factory-integrated, and the confidence score is below 40.

Scoring (0–100):

- +40 if the normalized PN is valid.
- +20 if quantity is a small integer (1–10).
- +20 if the description matches component nouns (disk, cpu, memory, nic, psu, fan, etc.).
- -40 if the description includes generic words (option, item, component, misc).

## HPE part-number normalization

HPE part numbers are normalized before evaluating format issues. The normalization trims and
collapses whitespace, removes short trailing tokens (2–4 alphanumeric characters) like
`0D1` or `B19`, preserves hyphens, and uppercases the result. If the normalized candidate
is valid, `HPE.RULE.004` emits an `info` finding indicating that trailing tokens were
ignored; otherwise, `HPE.RULE.004` remains a `warn` for suspicious values.

## Extending

Add new rule modules under `core/validation/vendor/hpe/rules` and include them in the
`RULES` list in `core/validation/vendor/hpe/index.js`.
